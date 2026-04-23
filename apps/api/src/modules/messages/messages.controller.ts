import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import type {
  CreateThreadInput,
  ListThreadsInput,
  ListThreadMessagesInput,
  SendMessageInput,
} from '@patacerta/shared'
import { Prisma } from '@prisma/client'

export const listThreads = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const { page, limit } = req.query as unknown as ListThreadsInput

  const breeder = await prisma.breeder.findUnique({ where: { userId } })

  const where: Prisma.ThreadWhereInput = {
    OR: [{ ownerId: userId }, ...(breeder ? [{ breederId: breeder.id }] : [])],
  }

  const [threads, total] = await Promise.all([
    prisma.thread.findMany({
      where,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        breeder: {
          select: {
            id: true,
            businessName: true,
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        messages: {
          select: { id: true, body: true, senderId: true, readAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.thread.count({ where }),
  ])

  const threadIds = threads.map((t) => t.id)
  const unreadCounts =
    threadIds.length > 0
      ? await prisma.message.groupBy({
          by: ['threadId'],
          where: {
            threadId: { in: threadIds },
            senderId: { not: userId },
            readAt: null,
          },
          _count: { id: true },
        })
      : []

  const unreadMap = new Map(unreadCounts.map((u) => [u.threadId, u._count.id]))
  const data = threads.map((t) => ({ ...t, unreadCount: unreadMap.get(t.id) ?? 0 }))

  res.json(paginatedResponse(data, total, page, limit))
})

export const createThread = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const data = req.body as CreateThreadInput

  const breeder = await prisma.breeder.findUnique({
    where: { id: data.breederId },
    include: { user: { select: { id: true, isActive: true, suspendedAt: true } } },
  })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.userId === userId)
    throw new AppError(400, 'Não pode enviar mensagem a si próprio', 'SELF_MESSAGE')
  if (breeder.status === 'SUSPENDED' || !breeder.user.isActive || breeder.user.suspendedAt) {
    throw new AppError(400, 'Este criador não está a receber mensagens', 'BREEDER_UNAVAILABLE')
  }

  // Use a transaction with upsert to atomically find-or-create thread,
  // preventing race conditions / duplicate threads.
  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.thread.upsert({
      where: { ownerId_breederId: { ownerId: userId, breederId: breeder.id } },
      create: { ownerId: userId, breederId: breeder.id, subject: data.subject },
      update: { updatedAt: new Date() },
    })
    const created = thread.createdAt.getTime() === thread.updatedAt.getTime()
    const message = await tx.message.create({
      data: { threadId: thread.id, senderId: userId, body: data.body },
    })
    // Ensure thread updatedAt reflects the new message
    if (!created) {
      await tx.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } })
    }
    return { thread, message, created }
  })

  await logAudit({
    userId,
    action: result.created ? 'THREAD_CREATED' : 'MESSAGE_SENT',
    entity: result.created ? 'thread' : 'message',
    entityId: result.created ? result.thread.id : result.message.id,
    details: result.created
      ? `Criador: ${breeder.businessName} | Assunto: ${data.subject}`
      : `Thread ${result.thread.id}`,
    ipAddress: req.ip,
  })

  res.status(201).json({
    threadId: result.thread.id,
    created: result.created,
    message: result.message,
  })
})

async function authorizeThreadAccess(threadId: number, userId: number) {
  const thread = await prisma.thread.findUnique({ where: { id: threadId } })
  if (!thread) throw new AppError(404, 'Conversa não encontrada', 'THREAD_NOT_FOUND')

  let isBreeder = false
  if (thread.ownerId !== userId) {
    const breeder = await prisma.breeder.findUnique({ where: { userId } })
    isBreeder = !!breeder && thread.breederId === breeder.id
    if (!isBreeder) throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  }

  return { thread, isOwner: thread.ownerId === userId, isBreeder }
}

export const getThread = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId
  const { page, limit } = req.query as unknown as ListThreadMessagesInput

  await authorizeThreadAccess(threadId, userId)

  const [thread, messages, totalMessages] = await Promise.all([
    prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        breeder: {
          select: {
            id: true,
            businessName: true,
            status: true,
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
      },
    }),
    // Messages paginated in reverse chronological order (newest first), client will reverse for display.
    prisma.message.findMany({
      where: { threadId },
      select: {
        id: true,
        senderId: true,
        body: true,
        readAt: true,
        createdAt: true,
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where: { threadId } }),
  ])

  res.json({
    ...thread,
    messages: messages.reverse(),
    pagination: {
      page,
      limit,
      total: totalMessages,
      totalPages: Math.max(1, Math.ceil(totalMessages / limit)),
    },
  })
})

export const sendMessage = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId
  const { body } = req.body as SendMessageInput

  const { thread } = await authorizeThreadAccess(threadId, userId)

  // Block suspended breeders from sending via thread too
  if (req.user!.role === 'BREEDER') {
    const b = await prisma.breeder.findUnique({ where: { userId } })
    if (b?.status === 'SUSPENDED') {
      throw new AppError(403, 'Conta suspensa. Não pode enviar mensagens.', 'BREEDER_SUSPENDED')
    }
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { threadId, senderId: userId, body },
      select: {
        id: true,
        senderId: true,
        body: true,
        readAt: true,
        createdAt: true,
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    }),
    prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
  ])

  await logAudit({
    userId,
    action: 'MESSAGE_SENT',
    entity: 'message',
    entityId: message.id,
    details: `Thread: ${thread.id}`,
    ipAddress: req.ip,
  })

  res.status(201).json(message)
})

export const markThreadAsRead = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId

  await authorizeThreadAccess(threadId, userId)

  const { count } = await prisma.message.updateMany({
    where: { threadId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  })

  res.json({ marked: count })
})

export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const breeder = await prisma.breeder.findUnique({ where: { userId } })

  const count = await prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      thread: {
        OR: [{ ownerId: userId }, ...(breeder ? [{ breederId: breeder.id }] : [])],
      },
    },
  })

  res.json({ unreadCount: count })
})
