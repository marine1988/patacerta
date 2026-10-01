import { Router } from 'express'
import { requireAuth, requireActiveUser } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createFeedbackSchema, listFeedbackSchema } from '@patacerta/shared'
import { feedbackCreateRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './feedback.controller.js'

export const feedbackRouter = Router()

// Public listing (sorted by votes or recent)
feedbackRouter.get('/', validate(listFeedbackSchema, 'query'), ctrl.listFeedback)

// Authenticated mutations
feedbackRouter.post(
  '/',
  requireAuth,
  requireActiveUser,
  feedbackCreateRateLimit,
  validate(createFeedbackSchema),
  ctrl.createFeedback,
)
feedbackRouter.post('/:id/vote', requireAuth, requireActiveUser, ctrl.voteFeedback)
feedbackRouter.delete('/:id/vote', requireAuth, requireActiveUser, ctrl.unvoteFeedback)
