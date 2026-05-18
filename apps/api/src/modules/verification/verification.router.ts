import { Router } from 'express'
import {
  requireAuth,
  requireRole,
  requireBreederProfile,
  requireActiveUser,
} from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { uploadRateLimit, apiRateLimit } from '../../middleware/rate-limit.js'
import { reviewVerificationDocSchema } from '@patacerta/shared'
import * as ctrl from './verification.controller.js'

export const verificationRouter = Router()

// Breeder: upload docs. requireActiveUser bloqueia uploads de uma conta
// suspensa dentro da janela do JWT (~15min).
verificationRouter.post(
  '/upload',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  uploadRateLimit,
  ctrl.uploadDocument,
)

// Breeder: list my docs
verificationRouter.get('/my-docs', requireAuth, requireBreederProfile, ctrl.getMyDocuments)

// Breeder: delete a doc (PENDING ou REJECTED). requireActiveUser por
// ser uma mutation.
verificationRouter.delete(
  '/:docId',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  ctrl.deleteDocument,
)

// Admin: review a doc. requireActiveUser tambem aqui — um admin
// suspenso nao deve poder aprovar/rejeitar com um JWT antigo.
verificationRouter.patch(
  '/:docId/review',
  requireAuth,
  requireActiveUser,
  requireRole('ADMIN'),
  validate(reviewVerificationDocSchema),
  ctrl.reviewDocument,
)

// Breeder or Admin: view a doc (presigned URL — legacy). apiRateLimit
// limita scraping caso uma sessao admin seja comprometida (iterar
// docIds 1..N para exfiltrar DGAVs).
verificationRouter.get('/:docId/view', requireAuth, apiRateLimit, ctrl.viewDocument)

// Breeder or Admin: stream a doc directly (proxy via API). Preferido
// sobre /view porque nao expoe presigned URLs e funciona em ambientes
// onde o MinIO nao tem hostname publico (stage/prod sem subdomain S3).
verificationRouter.get('/:docId/file', requireAuth, apiRateLimit, ctrl.streamDocument)
