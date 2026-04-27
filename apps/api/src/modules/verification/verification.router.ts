import { Router } from 'express'
import { requireAuth, requireRole, requireBreederProfile } from '../../middleware/auth.js'
import { uploadRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './verification.controller.js'

export const verificationRouter = Router()

// Breeder: upload docs
verificationRouter.post(
  '/upload',
  requireAuth,
  requireBreederProfile,
  uploadRateLimit,
  ctrl.uploadDocument,
)

// Breeder: list my docs
verificationRouter.get('/my-docs', requireAuth, requireBreederProfile, ctrl.getMyDocuments)

// Breeder: delete a doc (only if PENDING)
verificationRouter.delete('/:docId', requireAuth, requireBreederProfile, ctrl.deleteDocument)

// Admin: review a doc
verificationRouter.patch('/:docId/review', requireAuth, requireRole('ADMIN'), ctrl.reviewDocument)

// Breeder or Admin: view a doc (presigned URL)
verificationRouter.get('/:docId/view', requireAuth, ctrl.viewDocument)
