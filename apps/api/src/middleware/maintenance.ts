import { Request, Response, NextFunction } from 'express'

/**
 * Maintenance mode middleware.
 *
 * When MAINTENANCE_MODE=1 or MAINTENANCE_MODE=true:
 * - Returns 503 Service Unavailable for all requests
 * - Allows /api/health to pass through (for monitoring)
 * - Allows bypass with X-Maintenance-Bypass header matching MAINTENANCE_BYPASS_KEY
 *
 * Usage in Dokploy:
 *   MAINTENANCE_MODE=1                    # Enable maintenance mode
 *   MAINTENANCE_BYPASS_KEY=secret123      # Optional: allows admin bypass
 */
export function maintenanceMode(req: Request, res: Response, next: NextFunction) {
  const maintenanceEnabled =
    process.env.MAINTENANCE_MODE === '1' || process.env.MAINTENANCE_MODE === 'true'

  if (!maintenanceEnabled) {
    return next()
  }

  // Always allow health checks (for Dokploy/monitoring)
  if (req.path === '/api/health' || req.path === '/health') {
    return next()
  }

  // Allow bypass with secret header (for admin access during maintenance)
  const bypassKey = process.env.MAINTENANCE_BYPASS_KEY
  const bypassHeader = req.get('X-Maintenance-Bypass')
  if (bypassKey && bypassHeader === bypassKey) {
    return next()
  }

  // Return 503 with maintenance info
  res.status(503).json({
    error: 'Service Unavailable',
    message: 'O PataCerta está em manutenção. Voltamos em breve!',
    code: 'MAINTENANCE_MODE',
    retryAfter: 3600, // Suggest retry in 1 hour
  })
}
