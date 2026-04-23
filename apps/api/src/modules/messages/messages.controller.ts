import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import type {
  CreateThreadInput,
  EditMessageInput,
  ListThreadsInput,
  ListThreadMessagesInput,
  ReportMessageInput,
  SearchMessagesInput,
  SendMessageInput,
} from '@patacerta/shared'
import { MESSAGE_EDIT_WINDOW_MINUTES } from '@patacerta/shared'
import { Prisma } from '@prisma/client'

export const listThreads = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const { page, limit, archived } = req.query as unknown as ListThreadsInput

  const breeder = await prisma.breeder.findUnique({ where: { userId } })

  // A thread is "archived" relative to the current user: owner side checks
  // archivedByOwnerAt, breeder side checks archivedByBreederAt. A single AND
  // clause applied per OR branch is the cleanest way to express this.
  const ownerBranch: Prisma.ThreadWhereInput = {
    ownerId: userId,
    archivedByOwnerAt: archived ? { not: null } : null,
  }
  const breederBranch: Prisma.ThreadWhereInput | null = breeder
    ? {
        breederId: breeder.id,
        archivedByBreederAt: archived ? { not: null } : null,
      }
    : null

  const where: Prisma.ThreadWhereInput = {
    OR: breederBranch ? [ownerBranch, breederBranch] : [ownerBranch],
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
          select: {
            id: true,
            body: true,
            senderId: true,
            readAt: true,
            createdAt: true,
            deletedAt: true,
          },
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
  // Unread excludes soft-deleted messages.
  const unreadCounts =
    threadIds.length > 0
      ? await prisma.message.groupBy({
          by: ['threadId'],
          where: {
            threadId: { in: threadIds },
            senderId: { not: userId },
            readAt: null,
            deletedAt: null,
          },
          _count: { id: true },
        })
      : []

  const unreadMap = new Map(unreadCounts.map((u) => [u.threadId, u._count.id]))
  const data = threads.map((t) => {
    // Mask preview body if last message is soft-deleted
    const lastMsg = t.messages[0]
    const maskedMessages = lastMsg?.deletedAt
      ? [{ ...lastMsg, body: '(mensagem eliminada)' }]
      : t.messages
    return { ...t, messages: maskedMessages, unreadCount: unreadMap.get(t.id) ?? 0 }
  })

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
        editedAt: true,
        deletedAt: true,
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where: { threadId } }),
  ])

  // Auto-mark incoming messages as read when the thread is fetched.
  // Idempotent: only updates rows where readAt IS NULL and sender != userId.
  // Fire-and-forget — failure to mark read should never block the GET response.
  prisma.message
    .updateMany({
      where: { threadId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    })
    .catch(() => {
      // Swallow: mark-read is a side-effect; don't surface to caller.
    })

  // Mask body of soft-deleted messages so the client never receives the original text.
  const maskedMessages = messages
    .reverse()
    .map((m) => (m.deletedAt ? { ...m, body: '(mensagem eliminada)' } : m))

  res.json({
    ...thread,
    messages: maskedMessages,
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

  // Count unread across non-archived threads only, excluding soft-deleted messages.
  const count = await prisma.message.count({
    where: {
      readAt: null,
      deletedAt: null,
      senderId: { not: userId },
      thread: {
        OR: [
          { ownerId: userId, archivedByOwnerAt: null },
          ...(breeder ? [{ breederId: breeder.id, archivedByBreederAt: null }] : []),
        ],
      },
    },
  })

  res.json({ unreadCount: count })
})

// ──────────────────────────────────────────────────────────────────────
// Archive / unarchive
// ──────────────────────────────────────────────────────────────────────

export const archiveThread = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId
  const { isOwner, isBreeder } = await authorizeThreadAccess(threadId, userId)

  const data: Prisma.ThreadUpdateInput = {}
  if (isOwner) data.archivedByOwnerAt = new Date()
  if (isBreeder) data.archivedByBreederAt = new Date()

  await prisma.thread.update({ where: { id: threadId }, data })
  res.status(204).send()
})

export const unarchiveThread = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.threadId)
  const userId = req.user!.userId
  const { isOwner, isBreeder } = await authorizeThreadAccess(threadId, userId)

  const data: Prisma.ThreadUpdateInput = {}
  if (isOwner) data.archivedByOwnerAt = null
  if (isBreeder) data.archivedByBreederAt = null

  await prisma.thread.update({ where: { id: threadId }, data })
  res.status(204).send()
})

// ──────────────────────────────────────────────────────────────────────
// Edit / delete a single message (author-only, within 15min window)
// ──────────────────────────────────────────────────────────────────────

const EDIT_WINDOW_MS = MESSAGE_EDIT_WINDOW_MINUTES * 60_000

async function getEditableMessage(messageId: number, userId: number) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { thread: true },
  })
  if (!message) throw new AppError(404, 'Mensagem não encontrada', 'MESSAGE_NOT_FOUND')
  if (message.senderId !== userId)
    throw new AppError(403, 'Só o autor pode editar ou eliminar', 'FORBIDDEN')
  if (message.deletedAt) throw new AppError(400, 'Mensagem já eliminada', 'MESSAGE_DELETED')
  return message
}

export const editMessage = asyncHandler(async (req, res) => {
  const messageId = parseId(req.params.messageId)
  const userId = req.user!.userId
  const { body } = req.body as EditMessageInput

  const message = await getEditableMessage(messageId, userId)

  const ageMs = Date.now() - message.createdAt.getTime()
  if (ageMs > EDIT_WINDOW_MS) {
    throw new AppError(
      400,
      `A janela de edição (${MESSAGE_EDIT_WINDOW_MINUTES} minutos) já expirou`,
      'EDIT_WINDOW_EXPIRED',
    )
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { body, editedAt: new Date() },
    select: {
      id: true,
      senderId: true,
      body: true,
      readAt: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
      sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  })

  await logAudit({
    userId,
    action: 'MESSAGE_EDITED',
    entity: 'message',
    entityId: messageId,
    details: `Thread: ${message.threadId}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

export const deleteMessage = asyncHandler(async (req, res) => {
  const messageId = parseId(req.params.messageId)
  const userId = req.user!.userId

  const message = await getEditableMessage(messageId, userId)

  const ageMs = Date.now() - message.createdAt.getTime()
  if (ageMs > EDIT_WINDOW_MS) {
    throw new AppError(
      400,
      `A janela para eliminar (${MESSAGE_EDIT_WINDOW_MINUTES} minutos) já expirou`,
      'DELETE_WINDOW_EXPIRED',
    )
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), deletedBy: userId },
  })

  await logAudit({
    userId,
    action: 'MESSAGE_DELETED',
    entity: 'message',
    entityId: messageId,
    details: `Thread: ${message.threadId}`,
    ipAddress: req.ip,
  })

  res.status(204).send()
})

// ──────────────────────────────────────────────────────────────────────
// Report a message
// ──────────────────────────────────────────────────────────────────────

export const reportMessage = asyncHandler(async (req, res) => {
  const messageId = parseId(req.params.messageId)
  const userId = req.user!.userId
  const { reason } = req.body as ReportMessageInput

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { thread: true },
  })
  if (!message) throw new AppError(404, 'Mensagem não encontrada', 'MESSAGE_NOT_FOUND')

  // Only thread participants may report. The reporter may not be the author.
  const { isOwner, isBreeder } = await authorizeThreadAccess(message.threadId, userId)
  if (message.senderId === userId)
    throw new AppError(400, 'Não pode denunciar a própria mensagem', 'SELF_REPORT')
  void isOwner
  void isBreeder

  // One pending report per (message, reporter) — dedup silently.
  const existing = await prisma.messageReport.findFirst({
    where: { messageId, reporterId: userId, status: 'PENDING' },
  })
  if (existing) {
    res.status(200).json({ id: existing.id, duplicate: true })
    return
  }

  const report = await prisma.messageReport.create({
    data: { messageId, reporterId: userId, reason },
    select: { id: true, createdAt: true, status: true },
  })

  await logAudit({
    userId,
    action: 'MESSAGE_REPORTED',
    entity: 'message_report',
    entityId: report.id,
    details: `Message: ${messageId} | Thread: ${message.threadId} | Reason: ${reason.slice(0, 80)}`,
    ipAddress: req.ip,
  })

  res.status(201).json(report)
})

// ──────────────────────────────────────────────────────────────────────
// Search — only inside the authenticated user's own threads
// ──────────────────────────────────────────────────────────────────────

export const searchMessages = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const { q, page, limit } = req.query as unknown as SearchMessagesInput

  const breeder = await prisma.breeder.findUnique({ where: { userId } })

  // We use case-insensitive substring search. Postgres `ILIKE` is expressed
  // via Prisma's `contains` + `mode: 'insensitive'`. Not indexed beyond
  // b-tree; acceptable for current message volumes.
  const where: Prisma.MessageWhereInput = {
    deletedAt: null,
    body: { contains: q, mode: 'insensitive' },
    thread: {
      OR: [{ ownerId: userId }, ...(breeder ? [{ breederId: breeder.id }] : [])],
    },
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderId: true,
        threadId: true,
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        thread: {
          select: {
            id: true,
            subject: true,
            owner: { select: { id: true, firstName: true, lastName: true } },
            breeder: { select: { id: true, businessName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where }),
  ])

  res.json(paginatedResponse(messages, total, page, limit))
})
