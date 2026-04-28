import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import { searchBreedersSchema, mapBreedersSchema } from '@patacerta/shared'
import * as ctrl from './search.controller.js'

export const searchRouter = Router()

// Public endpoints
searchRouter.get('/stats', ctrl.getPublicStats)
searchRouter.get('/breeders', validate(searchBreedersSchema, 'query'), ctrl.searchBreeders)
searchRouter.get('/breeders/map', validate(mapBreedersSchema, 'query'), ctrl.mapBreeders)
searchRouter.get('/districts', ctrl.listDistricts)
searchRouter.get('/districts/:districtId/municipalities', ctrl.listMunicipalities)
