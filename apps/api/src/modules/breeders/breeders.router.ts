import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { breederProfileSchema, updateBreederProfileSchema } from '@patacerta/shared'
import * as ctrl from './breeders.controller.js'

export const breedersRouter = Router()

// B-21: /me routes MUST come before /:id to avoid matching "me" as an id param
// Breeder only — own profile management
breedersRouter.get('/me/profile', requireAuth, requireRole('BREEDER'), ctrl.getMyBreederProfile)
breedersRouter.patch('/me', requireAuth, requireRole('BREEDER'), validate(updateBreederProfileSchema), ctrl.updateMyBreederProfile)
breedersRouter.post('/me/submit-verification', requireAuth, requireRole('BREEDER'), ctrl.submitForVerification)

// Breeder — create profile
breedersRouter.post('/', requireAuth, requireRole('BREEDER'), validate(breederProfileSchema), ctrl.createBreederProfile)

// Public — view breeder profile (must be last)
breedersRouter.get('/:id', ctrl.getBreederById)
