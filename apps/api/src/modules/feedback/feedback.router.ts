import { Router } from 'express'
import { requireAuth, requireActiveUser } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createFeedbackSchema } from '@patacerta/shared'
import { feedbackCreateRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './feedback.controller.js'

export const feedbackRouter = Router()

// Devolve os feedbacks do utilizador autenticado (mais recente primeiro),
// com limite e vagas restantes. Usado pela pagina /feedback.
feedbackRouter.get('/mine', requireAuth, requireActiveUser, ctrl.getMyFeedback)

// Authenticated submission — até 5 feedbacks por utilizador (enforced in controller).
feedbackRouter.post(
  '/',
  requireAuth,
  requireActiveUser,
  feedbackCreateRateLimit,
  validate(createFeedbackSchema),
  ctrl.createFeedback,
)
