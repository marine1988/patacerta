import { Router } from 'express'
import { requireAuth, requireRole, requireBreederProfile } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import {
  breederProfileSchema,
  reorderBreederPhotosSchema,
  updateBreederProfileSchema,
} from '@patacerta/shared'
import * as ctrl from './breeders.controller.js'

export const breedersRouter = Router()

// B-21: /me routes MUST come before /:id to avoid matching "me" as an id param
// Existing breeder — own profile management (requires Breeder profile)
breedersRouter.get('/me/profile', requireAuth, requireBreederProfile, ctrl.getMyBreederProfile)
breedersRouter.patch(
  '/me',
  requireAuth,
  requireBreederProfile,
  validate(updateBreederProfileSchema),
  ctrl.updateMyBreederProfile,
)
breedersRouter.post(
  '/me/submit-verification',
  requireAuth,
  requireBreederProfile,
  ctrl.submitForVerification,
)

// Existing breeder — gallery management
breedersRouter.post('/me/photos', requireAuth, requireBreederProfile, ctrl.uploadBreederPhotos)
breedersRouter.patch(
  '/me/photos/reorder',
  requireAuth,
  requireBreederProfile,
  validate(reorderBreederPhotosSchema),
  ctrl.reorderBreederPhotos,
)
breedersRouter.delete(
  '/me/photos/:photoId',
  requireAuth,
  requireBreederProfile,
  ctrl.deleteBreederPhoto,
)

// Create profile — any authenticated user can create their first breeder profile.
// Auto-promotes role to BREEDER inside the controller (analogous to services).
breedersRouter.post('/', requireAuth, validate(breederProfileSchema), ctrl.createBreederProfile)

// Public — view breeder profile (must be last)
breedersRouter.get('/:id', ctrl.getBreederById)

// Keep `requireRole` import used elsewhere available; admin endpoints still use it.
void requireRole
