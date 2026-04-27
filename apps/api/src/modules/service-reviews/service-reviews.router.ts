import { Router } from 'express'
import { requireAuth, requireRole, optionalAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  createServiceReviewSchema,
  updateServiceReviewSchema,
  replyToServiceReviewSchema,
  listServiceReviewsSchema,
  moderateServiceReviewSchema,
  flagServiceReviewSchema,
} from '@patacerta/shared'
import { reviewCreateRateLimit, reviewFlagRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './service-reviews.controller.js'

export const serviceReviewsRouter = Router()

// Authenticated user scoped listings (must come before /:id)
serviceReviewsRouter.get('/mine', requireAuth, ctrl.listMyServiceReviews)
serviceReviewsRouter.get('/about-me', requireAuth, ctrl.listServiceReviewsAboutMe)
serviceReviewsRouter.get('/eligibility', requireAuth, ctrl.getServiceReviewEligibility)

// Public listing (admins get extra visibility via optionalAuth)
serviceReviewsRouter.get(
  '/',
  optionalAuth,
  validate(listServiceReviewsSchema, 'query'),
  ctrl.listServiceReviews,
)
serviceReviewsRouter.get('/:id', optionalAuth, ctrl.getServiceReviewById)

// Authenticated (any owner)
serviceReviewsRouter.post(
  '/',
  requireAuth,
  reviewCreateRateLimit,
  validate(createServiceReviewSchema),
  ctrl.createServiceReview,
)
serviceReviewsRouter.patch(
  '/:id',
  requireAuth,
  validate(updateServiceReviewSchema),
  ctrl.updateServiceReview,
)
serviceReviewsRouter.delete('/:id', requireAuth, ctrl.deleteServiceReview)

// Provider reply
serviceReviewsRouter.post(
  '/:id/reply',
  requireAuth,
  validate(replyToServiceReviewSchema),
  ctrl.replyToServiceReview,
)

// Flag review (any authenticated user)
serviceReviewsRouter.post(
  '/:id/flag',
  requireAuth,
  reviewFlagRateLimit,
  validate(flagServiceReviewSchema),
  ctrl.flagServiceReview,
)

// Admin moderation
serviceReviewsRouter.patch(
  '/:id/moderate',
  requireAuth,
  requireRole('ADMIN'),
  validate(moderateServiceReviewSchema),
  ctrl.moderateServiceReview,
)
serviceReviewsRouter.get(
  '/:id/flags',
  requireAuth,
  requireRole('ADMIN'),
  ctrl.listServiceReviewFlags,
)
serviceReviewsRouter.delete(
  '/:id/flags',
  requireAuth,
  requireRole('ADMIN'),
  ctrl.dismissServiceReviewFlags,
)
