// ============================================
// PataCerta — Services Router
// ============================================
//
// Mounts /api/services/*. Routes are split into three layers:
//   1. Public (no auth): listing, map, detail, categories.
//   2. Authenticated (any role): contact, report — the router applies
//      requireAuth here explicitly, not via .use(), because the public
//      routes above must remain anonymous.
//   3. Owner-side: create/edit/publish/pause/delete/photos. All ownership
//      checks run inside the controller (see loadOwnedService).

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  serviceCreateRateLimit,
  serviceMutationRateLimit,
  serviceReportRateLimit,
  threadCreateRateLimit,
  uploadRateLimit,
} from '../../middleware/rate-limit.js'
import {
  createServiceSchema,
  updateServiceSchema,
  publishServiceSchema,
  pauseServiceSchema,
  listServicesQuerySchema,
  mapServicesQuerySchema,
  contactServiceSchema,
  reportServiceSchema,
  reorderServicePhotosSchema,
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
  reorderPhotos,
  listServices,
  mapServices,
  getServiceById,
  listActiveCategories,
  contactService,
  reportService,
} from './services.controller.js'

export const servicesRouter = Router()

// ── Public (anonymous) ───────────────────────────────────────────────
// Specific paths are registered before the dynamic ":serviceId" ones so
// Express doesn't match "mine" / "map" / "categories" as an id.
servicesRouter.get('/categories', listActiveCategories)
servicesRouter.get('/map', validate(mapServicesQuerySchema, 'query'), mapServices)
servicesRouter.get('/', validate(listServicesQuerySchema, 'query'), listServices)

// ── Owner views (auth required) ──────────────────────────────────────
servicesRouter.get('/mine', requireAuth, getMyServices)
servicesRouter.get('/mine/:serviceId', requireAuth, getMyServiceById)

// Public detail is placed after "/mine*" to avoid collision.
servicesRouter.get('/:serviceId', getServiceById)

// ── Contact / report (auth required, rate-limited) ───────────────────
servicesRouter.post(
  '/:serviceId/contact',
  requireAuth,
  threadCreateRateLimit,
  validate(contactServiceSchema),
  contactService,
)
servicesRouter.post(
  '/:serviceId/report',
  requireAuth,
  serviceReportRateLimit,
  validate(reportServiceSchema),
  reportService,
)

// ── CRUD (auth + ownership) ──────────────────────────────────────────
servicesRouter.post(
  '/',
  requireAuth,
  serviceCreateRateLimit,
  validate(createServiceSchema),
  createService,
)
servicesRouter.patch(
  '/:serviceId',
  requireAuth,
  serviceMutationRateLimit,
  validate(updateServiceSchema),
  updateService,
)
servicesRouter.delete('/:serviceId', requireAuth, serviceMutationRateLimit, deleteService)

// ── Status transitions ───────────────────────────────────────────────
servicesRouter.post(
  '/:serviceId/publish',
  requireAuth,
  serviceMutationRateLimit,
  validate(publishServiceSchema),
  publishService,
)
servicesRouter.post(
  '/:serviceId/pause',
  requireAuth,
  serviceMutationRateLimit,
  validate(pauseServiceSchema),
  pauseService,
)

// ── Photos ───────────────────────────────────────────────────────────
// Multer parses the multipart body inside the controller so we can surface
// user-friendly AppError messages consistent with the rest of the API.
servicesRouter.post('/:serviceId/photos', requireAuth, uploadRateLimit, uploadPhotos)
servicesRouter.patch(
  '/:serviceId/photos/reorder',
  requireAuth,
  serviceMutationRateLimit,
  validate(reorderServicePhotosSchema),
  reorderPhotos,
)
servicesRouter.delete('/:serviceId/photos/:photoId', requireAuth, deletePhoto)
