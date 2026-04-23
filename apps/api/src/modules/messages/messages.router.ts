import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  createThreadSchema,
  sendMessageSchema,
  editMessageSchema,
  reportMessageSchema,
  listThreadsSchema,
  listThreadMessagesSchema,
  searchMessagesSchema,
} from '@patacerta/shared'
import { messageSendRateLimit, threadCreateRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './messages.controller.js'

export const messagesRouter = Router()

messagesRouter.use(requireAuth)

// Threads
messagesRouter.get('/threads', validate(listThreadsSchema, 'query'), ctrl.listThreads)
messagesRouter.post(
  '/threads',
  threadCreateRateLimit,
  validate(createThreadSchema),
  ctrl.createThread,
)
messagesRouter.get(
  '/threads/:threadId',
  validate(listThreadMessagesSchema, 'query'),
  ctrl.getThread,
)

// Archive / unarchive (per-side)
messagesRouter.patch('/threads/:threadId/archive', ctrl.archiveThread)
messagesRouter.patch('/threads/:threadId/unarchive', ctrl.unarchiveThread)

// Messages within a thread
messagesRouter.post(
  '/threads/:threadId/messages',
  messageSendRateLimit,
  validate(sendMessageSchema),
  ctrl.sendMessage,
)
messagesRouter.patch('/threads/:threadId/read', ctrl.markThreadAsRead)

// Edit / delete / report a single message
messagesRouter.patch('/messages/:messageId', validate(editMessageSchema), ctrl.editMessage)
messagesRouter.delete('/messages/:messageId', ctrl.deleteMessage)
messagesRouter.post(
  '/messages/:messageId/report',
  validate(reportMessageSchema),
  ctrl.reportMessage,
)

// Search across own threads
messagesRouter.get('/search', validate(searchMessagesSchema, 'query'), ctrl.searchMessages)

// Unread count
messagesRouter.get('/unread-count', ctrl.getUnreadCount)
