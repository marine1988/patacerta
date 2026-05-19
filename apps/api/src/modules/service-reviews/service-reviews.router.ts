import { Router } from 'express'
import { requireAuth, requireRole, requireActiveUser, optionalAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  createServiceReviewSchema,
  updateServiceReviewSchema,
  replyToServiceReviewSchema,
  listServiceReviewsSchema,
  moderateServiceReviewSchema,
  flagServiceReviewSchema,
  myServiceReviewsPaginationSchema,
} from '@patacerta/shared'
import { reviewCreateRateLimit, reviewFlagRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './service-reviews.controller.js'

export const serviceReviewsRouter = Router()

// Authenticated user scoped listings (must come before /:id)
serviceReviewsRouter.get(
  '/mine',
  requireAuth,
  validate(myServiceReviewsPaginationSchema, 'query'),
  ctrl.listMyServiceReviews,
)
serviceReviewsRouter.get(
  '/about-me',
  requireAuth,
  validate(myServiceReviewsPaginationSchema, 'query'),
  ctrl.listServiceReviewsAboutMe,
)
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
// requireActiveUser em TODAS as mutations: padrao consistente com
// /services, /reviews, /messages, /payments e /verification — fecha
// a janela ~15min em que um utilizador suspenso mantinha JWT valido.
serviceReviewsRouter.post(
  '/',
  requireAuth,
  requireActiveUser,
  reviewCreateRateLimit,
  validate(createServiceReviewSchema),
  ctrl.createServiceReview,
)
serviceReviewsRouter.patch(
  '/:id',
  requireAuth,
  requireActiveUser,
  validate(updateServiceReviewSchema),
  ctrl.updateServiceReview,
)
serviceReviewsRouter.delete('/:id', requireAuth, requireActiveUser, ctrl.deleteServiceReview)

// Provider reply
serviceReviewsRouter.post(
  '/:id/reply',
  requireAuth,
  requireActiveUser,
  validate(replyToServiceReviewSchema),
  ctrl.replyToServiceReview,
)

// Flag review (any authenticated user)
serviceReviewsRouter.post(
  '/:id/flag',
  requireAuth,
  requireActiveUser,
  reviewFlagRateLimit,
  validate(flagServiceReviewSchema),
  ctrl.flagServiceReview,
)

// Admin moderation
serviceReviewsRouter.patch(
  '/:id/moderate',
  requireAuth,
  requireActiveUser,
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
  requireActiveUser,
  requireRole('ADMIN'),
  ctrl.dismissServiceReviewFlags,
)
