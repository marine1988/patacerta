import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import type { CreateThreadInput, ListThreadsInput } from '@patacerta/shared'

// P1: Fix N+1 unread count — use groupBy instead of N individual count queries
export const listThreads = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const { page, limit } = req.query as unknown as ListThreadsInput

  const breeder = await prisma.breeder.findUnique({ where: { userId } })

  const where = {
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

  // P1: Single grouped query for unread counts instead of N individual queries
  const threadIds = threads.map((t) => t.id)
  const unreadCounts = threadIds.length > 0
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
    where: { id: data.recipientId },
    include: { user: true },
  })
  if (!breeder) throw new AppError(404, 'Criador não encontrado', 'BREEDER_NOT_FOUND')
  if (breeder.userId === userId) throw new AppError(400, 'Não pode enviar mensagem a si próprio', 'SELF_MESSAGE')

  // Check for existing thread
  const existingThread = await prisma.thread.findFirst({
    where: { ownerId: userId, breederId: breeder.id },
  })

  if (existingThread) {
    const message = await prisma.message.create({
      data: { threadId: existingThread.id, senderId: userId, body: data.body },
    })
    await prisma.thread.update({ where: { id: existingThread.id }, data: { updatedAt: new Date() } })
    res.status(201).json({ threadId: existingThread.id, message })
    return
  }

  const thread = await prisma.thread.create({
    data: {
      ownerId: userId,
      breederId: breeder.id,
      subject: data.subject,
      messages: { create: { senderId: userId, body: data.body } },
    },
    include: {
      messages: true,
      owner: { select: { id: true, firstName: true, lastName: true } },
      breeder: { select: { id: true, businessName: true } },
    },
  })

  res.status(201).json(thread)
})

// A3: Extract thread authorization helper
async function authorizeThreadAccess(threadId: number, userId: number) {
  const breeder = await prisma.breeder.findUnique({ where: { userId } })
  const thread = await prisma.thread.findUnique({ where: { id: threadId } })
  if (!thread) throw new AppError(404, 'Conversa não encontrada', 'THREAD_NOT_FOUND')

  const isOwner = thread.ownerId === userId
  const isBreeder = breeder && thread.breederId === breeder.id
  if (!isOwner && !isBreeder) throw new AppError(403, 'Sem permissão', 'FORBIDDEN')

  return { thread, breeder }
}

export const getThread = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId

  await authorizeThreadAccess(threadId, userId)

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
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
        select: {
          id: true,
          senderId: true,
          body: true,
          readAt: true,
          createdAt: true,
          sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  res.json(thread)
})

export const sendMessage = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId

  await authorizeThreadAccess(threadId, userId)

  const message = await prisma.message.create({
    data: { threadId, senderId: userId, body: req.body.body },
    select: {
      id: true,
      senderId: true,
      body: true,
      createdAt: true,
      sender: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  await prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })

  res.status(201).json(message)
})

// Q6: Fixed — now checks authorization before marking as read
export const markThreadAsRead = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId

  await authorizeThreadAccess(threadId, userId)

  await prisma.message.updateMany({
    where: { threadId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  })

  res.status(204).send()
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
