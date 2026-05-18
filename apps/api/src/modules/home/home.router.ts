import { Router } from 'express'
import { searchRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './home.controller.js'

export const homeRouter = Router()

// Public endpoint — featured services + breeders for the homepage carousels.
// No auth. searchRateLimit (30/min) cobre o custo: mesmo com cache Redis
// de 60s, em cache-miss sao 4 queries paralelas com take:50 e 4-table
// joins (~200 rows com joins). 30 req/min/IP da' folga para visitantes
// legitimos e impede scrapers.
homeRouter.get('/featured', searchRateLimit, ctrl.getFeatured)
