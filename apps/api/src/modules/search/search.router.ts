import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import { searchBreedersSchema, mapBreedersSchema } from '@patacerta/shared'
import { searchRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './search.controller.js'

export const searchRouter = Router()

// Public endpoints
searchRouter.get('/stats', ctrl.getPublicStats)
searchRouter.get(
  '/breeders',
  searchRateLimit,
  validate(searchBreedersSchema, 'query'),
  ctrl.searchBreeders,
)
searchRouter.get(
  '/breeders/map',
  searchRateLimit,
  validate(mapBreedersSchema, 'query'),
  ctrl.mapBreeders,
)
searchRouter.get('/districts', ctrl.listDistricts)
searchRouter.get('/districts/:districtId/municipalities', ctrl.listMunicipalities)
