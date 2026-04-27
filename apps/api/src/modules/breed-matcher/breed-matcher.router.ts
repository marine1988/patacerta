import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import { breedMatchInputSchema } from '@patacerta/shared'
import * as ctrl from './breed-matcher.controller.js'

export const breedMatcherRouter = Router()

// Endpoint público — sem auth. Stateless.
breedMatcherRouter.post('/match', validate(breedMatchInputSchema, 'body'), ctrl.matchBreeds)
