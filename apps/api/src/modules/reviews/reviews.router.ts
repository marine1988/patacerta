import { Router } from 'express'
import {
  requireAuth,
  requireRole,
  requireBreederProfile,
  optionalAuth,
} from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  createReviewSchema,
  updateReviewSchema,
  replyToReviewSchema,
  listReviewsSchema,
  moderateReviewSchema,
  flagReviewSchema,
} from '@patacerta/shared'
import { reviewCreateRateLimit, reviewFlagRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './reviews.controller.js'

export const reviewsRouter = Router()

// Authenticated user scoped listings (must come before /:id)
reviewsRouter.get('/mine', requireAuth, ctrl.listMyReviews)
reviewsRouter.get('/about-me', requireAuth, requireBreederProfile, ctrl.listReviewsAboutMe)
reviewsRouter.get('/eligibility', requireAuth, ctrl.getReviewEligibility)

// Public listing (admins get extra visibility via optionalAuth)
reviewsRouter.get('/', optionalAuth, validate(listReviewsSchema, 'query'), ctrl.listReviews)
reviewsRouter.get('/:id', optionalAuth, ctrl.getReviewById)

// Authenticated (owners)
reviewsRouter.post(
  '/',
  requireAuth,
  reviewCreateRateLimit,
  validate(createReviewSchema),
  ctrl.createReview,
)
reviewsRouter.patch('/:id', requireAuth, validate(updateReviewSchema), ctrl.updateReview)
reviewsRouter.delete('/:id', requireAuth, ctrl.deleteReview)

// Breeder reply
reviewsRouter.post(
  '/:id/reply',
  requireAuth,
  requireBreederProfile,
  validate(replyToReviewSchema),
  ctrl.replyToReview,
)

// Flag review (any authenticated user)
reviewsRouter.post(
  '/:id/flag',
  requireAuth,
  reviewFlagRateLimit,
  validate(flagReviewSchema),
  ctrl.flagReview,
)

// Admin moderation
reviewsRouter.patch(
  '/:id/moderate',
  requireAuth,
  requireRole('ADMIN'),
  validate(moderateReviewSchema),
  ctrl.moderateReview,
)
reviewsRouter.get('/:id/flags', requireAuth, requireRole('ADMIN'), ctrl.listReviewFlags)
reviewsRouter.delete('/:id/flags', requireAuth, requireRole('ADMIN'), ctrl.dismissReviewFlags)
