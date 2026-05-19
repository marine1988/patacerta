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
import { requireAuth, requireActiveUser } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  serviceCreateRateLimit,
  serviceMutationRateLimit,
  serviceReportRateLimit,
  threadCreateRateLimit,
  uploadRateLimit,
  searchRateLimit,
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
servicesRouter.get('/map', searchRateLimit, validate(mapServicesQuerySchema, 'query'), mapServices)
servicesRouter.get('/', searchRateLimit, validate(listServicesQuerySchema, 'query'), listServices)

// ── Owner views (auth required) ──────────────────────────────────────
servicesRouter.get('/mine', requireAuth, getMyServices)
servicesRouter.get('/mine/:serviceId', requireAuth, getMyServiceById)

// Public detail is placed after "/mine*" to avoid collision.
servicesRouter.get('/:serviceId', getServiceById)

// ── Contact / report (auth required, rate-limited) ───────────────────
// requireActiveUser: utilizadores suspensos nao podem iniciar threads
// (mesmo padrao que /messages/threads). Para denuncias, preferimos
// bloquear utilizadores suspensos para evitar abuso de denuncia como
// vector de retaliacao depois de uma suspensao.
servicesRouter.post(
  '/:serviceId/contact',
  requireAuth,
  requireActiveUser,
  threadCreateRateLimit,
  validate(contactServiceSchema),
  contactService,
)
servicesRouter.post(
  '/:serviceId/report',
  requireAuth,
  requireActiveUser,
  serviceReportRateLimit,
  validate(reportServiceSchema),
  reportService,
)

// ── CRUD (auth + ownership) ──────────────────────────────────────────
// requireActiveUser em TODAS as mutations: fecha a janela ~15min em que
// um utilizador acabado de suspender mantinha JWT valido e podia continuar
// a criar/editar/eliminar servicos (e por extensao expor PII e ocupar
// recursos). Padrao consistente com /messages, /payments e /verification.
servicesRouter.post(
  '/',
  requireAuth,
  requireActiveUser,
  serviceCreateRateLimit,
  validate(createServiceSchema),
  createService,
)
servicesRouter.patch(
  '/:serviceId',
  requireAuth,
  requireActiveUser,
  serviceMutationRateLimit,
  validate(updateServiceSchema),
  updateService,
)
servicesRouter.delete(
  '/:serviceId',
  requireAuth,
  requireActiveUser,
  serviceMutationRateLimit,
  deleteService,
)

// ── Status transitions ───────────────────────────────────────────────
servicesRouter.post(
  '/:serviceId/publish',
  requireAuth,
  requireActiveUser,
  serviceMutationRateLimit,
  validate(publishServiceSchema),
  publishService,
)
servicesRouter.post(
  '/:serviceId/pause',
  requireAuth,
  requireActiveUser,
  serviceMutationRateLimit,
  validate(pauseServiceSchema),
  pauseService,
)

// ── Photos ───────────────────────────────────────────────────────────
// Multer parses the multipart body inside the controller so we can surface
// user-friendly AppError messages consistent with the rest of the API.
servicesRouter.post(
  '/:serviceId/photos',
  requireAuth,
  requireActiveUser,
  uploadRateLimit,
  uploadPhotos,
)
servicesRouter.patch(
  '/:serviceId/photos/reorder',
  requireAuth,
  requireActiveUser,
  serviceMutationRateLimit,
  validate(reorderServicePhotosSchema),
  reorderPhotos,
)
servicesRouter.delete(
  '/:serviceId/photos/:photoId',
  requireAuth,
  requireActiveUser,
  serviceMutationRateLimit,
  deletePhoto,
)
