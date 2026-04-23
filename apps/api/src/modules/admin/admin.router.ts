import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
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

// Audit logs
adminRouter.get('/audit-logs', ctrl.getAuditLogs)
