import { Router } from 'express'
import { requireAuth, requireActiveUser } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createFeedbackSchema } from '@patacerta/shared'
import { feedbackCreateRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './feedback.controller.js'

export const feedbackRouter = Router()

// Authenticated submission — one feedback per user (enforced in controller).
feedbackRouter.post(
  '/',
  requireAuth,
  requireActiveUser,
  feedbackCreateRateLimit,
  validate(createFeedbackSchema),
  ctrl.createFeedback,
)
