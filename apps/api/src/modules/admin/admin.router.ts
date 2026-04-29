import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  resolveReportSchema,
  resolveServiceReportSchema,
  suspendServiceSchema,
  suspendBreederSchema,
  suspendUserSchema,
  featuredPayloadSchema,
  createSponsoredSlotSchema,
  updateSponsoredSlotSchema,
  listSponsoredSlotsSchema,
} from '@patacerta/shared'
import * as ctrl from './admin.controller.js'
import * as sponsoredCtrl from '../sponsored-slots/admin-sponsored-slots.controller.js'

export const adminRouter = Router()

// All admin routes require ADMIN role
adminRouter.use(requireAuth, requireRole('ADMIN'))

// Dashboard stats
adminRouter.get('/stats', ctrl.getDashboardStats)
adminRouter.get('/pending-counts', ctrl.getPendingCounts)

// Verification queue
adminRouter.get('/verifications/pending', ctrl.getPendingVerifications)

// Users management
adminRouter.get('/users', ctrl.listAllUsers)
adminRouter.patch('/users/:id/suspend', validate(suspendUserSchema), ctrl.suspendUser)

// Breeders management — admin so pode suspender/reactivar.
// A promocao para VERIFIED acontece exclusivamente via aprovacao do
// documento DGAV (PATCH /verification/:docId/review).
adminRouter.get('/breeders', ctrl.listAllBreeders)
adminRouter.patch('/breeders/:id/suspend', validate(suspendBreederSchema), ctrl.suspendBreeder)
adminRouter.patch('/breeders/:id/unsuspend', ctrl.unsuspendBreeder)

// Reviews moderation
adminRouter.get('/reviews/flagged', ctrl.getFlaggedReviews)

// Message reports moderation
adminRouter.get('/message-reports', ctrl.listMessageReports)
adminRouter.get('/message-reports/:id', ctrl.getMessageReport)
adminRouter.patch(
  '/message-reports/:id/resolve',
  validate(resolveReportSchema),
  ctrl.resolveMessageReport,
)

// Service reports moderation
adminRouter.get('/service-reports', ctrl.listServiceReports)
adminRouter.get('/service-reports/:id', ctrl.getServiceReport)
adminRouter.patch(
  '/service-reports/:id/resolve',
  validate(resolveServiceReportSchema),
  ctrl.resolveServiceReport,
)
adminRouter.patch(
  '/service-reports/:id/dismiss',
  validate(resolveServiceReportSchema),
  ctrl.dismissServiceReport,
)

// Service suspension (admin-initiated)
adminRouter.get('/services', ctrl.listAllServices)
adminRouter.post('/services/:id/suspend', validate(suspendServiceSchema), ctrl.adminSuspendService)
adminRouter.post('/services/:id/reactivate', ctrl.adminReactivateService)

// Audit logs
adminRouter.get('/audit-logs', ctrl.getAuditLogs)

// Featured / homepage destaques
adminRouter.patch(
  '/services/:id/featured',
  validate(featuredPayloadSchema),
  ctrl.setServiceFeatured,
)
adminRouter.patch(
  '/breeders/:id/featured',
  validate(featuredPayloadSchema),
  ctrl.setBreederFeatured,
)

// Sponsored slots — gestão de campanhas patrocinadas no simulador
adminRouter.get(
  '/sponsored-slots',
  validate(listSponsoredSlotsSchema, 'query'),
  sponsoredCtrl.listSponsoredSlots,
)
adminRouter.post(
  '/sponsored-slots',
  validate(createSponsoredSlotSchema),
  sponsoredCtrl.createSponsoredSlot,
)
adminRouter.patch(
  '/sponsored-slots/:id',
  validate(updateSponsoredSlotSchema),
  sponsoredCtrl.updateSponsoredSlot,
)
adminRouter.delete('/sponsored-slots/:id', sponsoredCtrl.deleteSponsoredSlot)
