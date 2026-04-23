import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  createThreadSchema,
  sendMessageSchema,
  listThreadsSchema,
  listThreadMessagesSchema,
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

// Messages within a thread
messagesRouter.post(
  '/threads/:threadId/messages',
  messageSendRateLimit,
  validate(sendMessageSchema),
  ctrl.sendMessage,
)
messagesRouter.patch('/threads/:threadId/read', ctrl.markThreadAsRead)

// Unread count
messagesRouter.get('/unread-count', ctrl.getUnreadCount)
