import { Router } from 'express'
import { requireAuth, requireRole, requireActiveUser } from '../../middleware/auth.js'
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
  listUsersQuerySchema,
  listBreedersQuerySchema,
  listAllServicesQuerySchema,
  flaggedReviewsQuerySchema,
  listReportsQuerySchema,
  auditLogsQuerySchema,
} from '@patacerta/shared'
import * as ctrl from './admin.controller.js'
import * as sponsoredCtrl from '../sponsored-slots/admin-sponsored-slots.controller.js'

export const adminRouter = Router()

// All admin routes require:
//  - JWT valido (requireAuth)
//  - papel ADMIN (requireRole)
//  - conta activa (requireActiveUser): fecha a janela em que um admin
//    suspenso por um par mantinha acesso ate' o access token expirar
//    (15 min). Embora suspendUser ja' revogue os refresh tokens, o
//    access token JWT permanece criptograficamente valido ate' ao seu
//    `exp` — sem este guard, o admin suspenso continuava a executar
//    accoes administrativas sensiveis (suspensoes, moderacao, viewing
//    de PII) durante esse intervalo. Cada request adiciona 1 findUnique
//    (~1-3ms) que e' aceitavel para endpoints admin (baixo volume).
//
// Nota: `apiRateLimit` ja' esta aplicado globalmente em index.ts (200/15min
// por IP), pelo que cobre todos os endpoints abaixo sem necessidade de
// repeticao por-router.
adminRouter.use(requireAuth, requireRole('ADMIN'), requireActiveUser)

// Dashboard stats
adminRouter.get('/stats', ctrl.getDashboardStats)
adminRouter.get('/pending-counts', ctrl.getPendingCounts)

// Verification queue
adminRouter.get('/verifications/pending', ctrl.getPendingVerifications)

// Users management
adminRouter.get('/users', validate(listUsersQuerySchema, 'query'), ctrl.listAllUsers)
adminRouter.get('/users/:id', ctrl.getUserDetail)
adminRouter.patch('/users/:id/suspend', validate(suspendUserSchema), ctrl.suspendUser)
adminRouter.patch('/users/:id/unsuspend', ctrl.unsuspendUser)

// Breeders management — admin so pode suspender/reactivar.
// A promocao para VERIFIED acontece exclusivamente via aprovacao do
// documento DGAV (PATCH /verification/:docId/review).
adminRouter.get('/breeders', validate(listBreedersQuerySchema, 'query'), ctrl.listAllBreeders)
// Detalhe completo (perfil + docs + dono + racas) usado pela pagina
// /admin/criadores/:id para o admin verificar o cartao DGAV antes de
// aprovar a verificacao.
adminRouter.get('/breeders/:id', ctrl.getBreederDetail)
adminRouter.patch('/breeders/:id/suspend', validate(suspendBreederSchema), ctrl.suspendBreeder)
adminRouter.patch('/breeders/:id/unsuspend', ctrl.unsuspendBreeder)

// Reviews moderation
adminRouter.get(
  '/reviews/flagged',
  validate(flaggedReviewsQuerySchema, 'query'),
  ctrl.getFlaggedReviews,
)

// Message reports moderation
adminRouter.get(
  '/message-reports',
  validate(listReportsQuerySchema, 'query'),
  ctrl.listMessageReports,
)
adminRouter.get('/message-reports/:id', ctrl.getMessageReport)
adminRouter.patch(
  '/message-reports/:id/resolve',
  validate(resolveReportSchema),
  ctrl.resolveMessageReport,
)

// Service reports moderation
adminRouter.get(
  '/service-reports',
  validate(listReportsQuerySchema, 'query'),
  ctrl.listServiceReports,
)
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
adminRouter.get('/services', validate(listAllServicesQuerySchema, 'query'), ctrl.listAllServices)
adminRouter.post('/services/:id/suspend', validate(suspendServiceSchema), ctrl.adminSuspendService)
adminRouter.post('/services/:id/reactivate', ctrl.adminReactivateService)

// Audit logs
adminRouter.get('/audit-logs', validate(auditLogsQuerySchema, 'query'), ctrl.getAuditLogs)

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

// Internal/maintenance — utilitarios admin para staging
// (bloqueados em producao pelo controller via NODE_ENV check).
adminRouter.post('/internal/run-demo-seed', ctrl.runDemoSeed)
