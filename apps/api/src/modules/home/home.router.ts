import { Router } from 'express'
import * as ctrl from './home.controller.js'

export const homeRouter = Router()

// Public endpoint — featured services + breeders for the homepage carousels.
// No auth, no rate limit beyond global.
homeRouter.get('/featured', ctrl.getFeatured)
