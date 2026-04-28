import { Router } from 'express'
import * as ctrl from './breeds.controller.js'

export const breedsRouter = Router()

// GET /api/breeds — público, sem auth
breedsRouter.get('/', ctrl.listBreeds)
