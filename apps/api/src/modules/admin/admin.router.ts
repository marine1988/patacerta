import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  resolveReportSchema,
  resolveServiceReportSchema,
  suspendServiceSchema,
} from '@patacerta/shared'
import * as ctrl from './admin.controller.js'

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
adminRouter.patch('/users/:id/suspend', ctrl.suspendUser)

// Breeders management
adminRouter.get('/breeders', ctrl.listAllBreeders)
adminRouter.patch('/breeders/:id/status', ctrl.changeBreederStatus)

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
adminRouter.post('/services/:id/suspend', validate(suspendServiceSchema), ctrl.adminSuspendService)

// Audit logs
adminRouter.get('/audit-logs', ctrl.getAuditLogs)
