// ============================================
// PataCerta — Services Router (owner-side)
// ============================================
//
// Mounts /api/services/*. Public listing/filters/contact/reports will
// live in a later PR on separate sub-paths; this file is scoped to the
// authenticated provider's own management endpoints.

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { serviceCreateRateLimit } from '../../middleware/rate-limit.js'
import {
  createServiceSchema,
  updateServiceSchema,
  publishServiceSchema,
  pauseServiceSchema,
} from '@patacerta/shared'
import {
  createService,
  updateService,
  publishService,
  pauseService,
  deleteService,
  getMyServices,
  getMyServiceById,
  uploadPhotos,
  deletePhoto,
} from './services.controller.js'

export const servicesRouter = Router()

// All endpoints below require authentication. The controller performs
// ownership checks where relevant.
servicesRouter.use(requireAuth)

// ── Owner views ──────────────────────────────────────────────────────
servicesRouter.get('/mine', getMyServices)
servicesRouter.get('/mine/:serviceId', getMyServiceById)

// ── CRUD ─────────────────────────────────────────────────────────────
servicesRouter.post('/', serviceCreateRateLimit, validate(createServiceSchema), createService)
servicesRouter.patch('/:serviceId', validate(updateServiceSchema), updateService)
servicesRouter.delete('/:serviceId', deleteService)

// ── Status transitions ───────────────────────────────────────────────
servicesRouter.post('/:serviceId/publish', validate(publishServiceSchema), publishService)
servicesRouter.post('/:serviceId/pause', validate(pauseServiceSchema), pauseService)

// ── Photos ───────────────────────────────────────────────────────────
// Multer parses the multipart body inside the controller so we can surface
// user-friendly AppError messages consistent with the rest of the API.
servicesRouter.post('/:serviceId/photos', uploadPhotos)
servicesRouter.delete('/:serviceId/photos/:photoId', deletePhoto)
