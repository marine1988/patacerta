import { Router } from 'express'
import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'

export const healthRouter = Router()

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
        },
        // Debug: expose maintenance mode status
        maintenance: {
          enabled: process.env.MAINTENANCE_MODE === '1' || process.env.MAINTENANCE_MODE === 'true',
          raw: process.env.MAINTENANCE_MODE ?? '(not set)',
        },
      })
    } catch {
      res.status(503).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          database: 'disconnected',
        },
      })
    }
  }),
)
