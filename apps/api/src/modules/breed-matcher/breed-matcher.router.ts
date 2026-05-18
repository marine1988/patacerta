import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import { breedMatchInputSchema } from '@patacerta/shared'
import { searchRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './breed-matcher.controller.js'

export const breedMatcherRouter = Router()

// Endpoint público — sem auth. Stateless. searchRateLimit (30/min) cobre
// o custo: o scoring percorre ~104 racas e ainda faz fetch de sponsored
// slots com nested includes (district, municipality, photos). Sem este
// limite, um atacante pode martelar /match em loop e o cache de racas
// nao protege a query de sponsored.
breedMatcherRouter.post(
  '/match',
  searchRateLimit,
  validate(breedMatchInputSchema, 'body'),
  ctrl.matchBreeds,
)
