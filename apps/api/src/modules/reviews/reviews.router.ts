import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  createReviewSchema,
  updateReviewSchema,
  replyToReviewSchema,
  listReviewsSchema,
  moderateReviewSchema,
} from '@patacerta/shared'
import * as ctrl from './reviews.controller.js'

export const reviewsRouter = Router()

// Public
reviewsRouter.get('/', validate(listReviewsSchema, 'query'), ctrl.listReviews)
reviewsRouter.get('/:id', ctrl.getReviewById)

// Authenticated (owners)
reviewsRouter.post('/', requireAuth, validate(createReviewSchema), ctrl.createReview)
reviewsRouter.patch('/:id', requireAuth, validate(updateReviewSchema), ctrl.updateReview)
reviewsRouter.delete('/:id', requireAuth, ctrl.deleteReview)

// Breeder reply
reviewsRouter.post('/:id/reply', requireAuth, requireRole('BREEDER'), validate(replyToReviewSchema), ctrl.replyToReview)

// Flag review (any authenticated user)
reviewsRouter.post('/:id/flag', requireAuth, ctrl.flagReview)

// Admin moderation
reviewsRouter.patch('/:id/moderate', requireAuth, requireRole('ADMIN'), validate(moderateReviewSchema), ctrl.moderateReview)
