import { Router } from 'express'
import {
  requireAuth,
  requireRole,
  requireBreederProfile,
  requireActiveUser,
} from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  uploadRateLimit,
  breederCreateRateLimit,
  breederMutationRateLimit,
} from '../../middleware/rate-limit.js'
import {
  breederProfileSchema,
  reorderBreederPhotosSchema,
  updateBreederProfileSchema,
} from '@patacerta/shared'
import * as ctrl from './breeders.controller.js'

export const breedersRouter = Router()

// B-21: /me routes MUST come before /:id to avoid matching "me" as an id param
// Existing breeder — own profile management (requires Breeder profile).
//
// requireActiveUser em TODAS as mutations: JWT vive ate 15min; sem este
// guard, um utilizador suspenso ainda podia editar perfil/fotos/submeter
// para verificacao durante a janela. GETs ficam livres para permitir
// export/visualizacao dos proprios dados (RGPD).
breedersRouter.get('/me/profile', requireAuth, requireBreederProfile, ctrl.getMyBreederProfile)
breedersRouter.patch(
  '/me',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  breederMutationRateLimit,
  validate(updateBreederProfileSchema),
  ctrl.updateMyBreederProfile,
)
breedersRouter.post(
  '/me/submit-verification',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  breederMutationRateLimit,
  ctrl.submitForVerification,
)
breedersRouter.delete(
  '/me',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  breederMutationRateLimit,
  ctrl.deleteMyBreederProfile,
)

// Existing breeder — gallery management. uploadRateLimit protege contra
// uso de armazenamento como vector de DoS / scraping de slots.
breedersRouter.post(
  '/me/photos',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  uploadRateLimit,
  ctrl.uploadBreederPhotos,
)
breedersRouter.patch(
  '/me/photos/reorder',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  breederMutationRateLimit,
  validate(reorderBreederPhotosSchema),
  ctrl.reorderBreederPhotos,
)
breedersRouter.delete(
  '/me/photos/:photoId',
  requireAuth,
  requireActiveUser,
  requireBreederProfile,
  breederMutationRateLimit,
  ctrl.deleteBreederPhoto,
)

// Create profile — any authenticated user can create their first breeder profile.
// Auto-promotes role to BREEDER inside the controller (analogous to services).
breedersRouter.post(
  '/',
  requireAuth,
  requireActiveUser,
  breederCreateRateLimit,
  validate(breederProfileSchema),
  ctrl.createBreederProfile,
)

// Public — view breeder profile (must be last)
breedersRouter.get('/:id', ctrl.getBreederById)

// Keep `requireRole` import used elsewhere available; admin endpoints still use it.
void requireRole
