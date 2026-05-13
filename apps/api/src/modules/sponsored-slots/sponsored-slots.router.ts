import { Router } from 'express'
import * as ctrl from './sponsored-slots.controller.js'
import { sponsoredSlotClickRateLimit } from '../../middleware/rate-limit.js'

export const sponsoredSlotsRouter = Router()

// POST /api/sponsored-slots/:slotId/click — público, sem auth.
// Rate-limit dedicado por (IP, slotId) para travar inflacao de CTR
// via scripts (alem do apiRateLimit global por IP).
sponsoredSlotsRouter.post('/:slotId/click', sponsoredSlotClickRateLimit, ctrl.trackClick)
