import { Router } from 'express'
import * as ctrl from './sponsored-slots.controller.js'

export const sponsoredSlotsRouter = Router()

// POST /api/sponsored-slots/:slotId/click — público, sem auth
sponsoredSlotsRouter.post('/:slotId/click', ctrl.trackClick)
