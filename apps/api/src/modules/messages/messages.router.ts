import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createThreadSchema, sendMessageSchema, listThreadsSchema } from '@patacerta/shared'
import * as ctrl from './messages.controller.js'

export const messagesRouter = Router()

// All routes require auth
messagesRouter.use(requireAuth)

// Threads
messagesRouter.get('/threads', validate(listThreadsSchema, 'query'), ctrl.listThreads)
messagesRouter.post('/threads', validate(createThreadSchema), ctrl.createThread)
messagesRouter.get('/threads/:threadId', ctrl.getThread)

// Messages within a thread
messagesRouter.post('/threads/:threadId/messages', validate(sendMessageSchema), ctrl.sendMessage)
messagesRouter.patch('/threads/:threadId/read', ctrl.markThreadAsRead)

// Unread count
messagesRouter.get('/unread-count', ctrl.getUnreadCount)
