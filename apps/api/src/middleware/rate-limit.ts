import type { Request, Response, NextFunction } from 'express'

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number }
}

const store: RateLimitStore = {}

// Clean up expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now()
    for (const key of Object.keys(store)) {
      if (store[key].resetAt <= now) delete store[key]
    }
  },
  5 * 60 * 1000,
)

interface RateLimitOptions {
  windowMs?: number
  max?: number
  message?: string
  keyGenerator?: (req: Request) => string
}

/**
 * Simple in-memory rate limiter.
 * For production with multiple instances, use Redis-backed rate limiting.
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Demasiados pedidos. Tente novamente mais tarde.',
    keyGenerator = (req: Request) => req.ip || 'unknown',
  } = options

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req)
    const now = Date.now()

    if (!store[key] || store[key].resetAt <= now) {
      store[key] = { count: 1, resetAt: now + windowMs }
    } else {
      store[key].count++
    }

    const remaining = Math.max(0, max - store[key].count)
    res.set('X-RateLimit-Limit', String(max))
    res.set('X-RateLimit-Remaining', String(remaining))
    res.set('X-RateLimit-Reset', String(Math.ceil(store[key].resetAt / 1000)))

    if (store[key].count > max) {
      res.status(429).json({ error: message, code: 'RATE_LIMITED' })
      return
    }

    next()
  }
}

// Pre-configured rate limiters
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiadas tentativas de autenticação. Tente em 15 minutos.',
})

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
})

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Limite de uploads atingido. Tente novamente em 1 hora.',
})

// Per-authenticated-user key generator. Falls back to IP for unauthenticated requests.
const userKey = (req: Request) => {
  const userId = (req as Request & { user?: { userId: number } }).user?.userId
  return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`
}

export const reviewCreateRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  message: 'Limite diário de avaliações atingido. Tente novamente amanhã.',
  keyGenerator: userKey,
})

export const reviewFlagRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiadas denúncias. Tente novamente mais tarde.',
  keyGenerator: userKey,
})

export const messageSendRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Está a enviar mensagens demasiado depressa. Aguarde um momento.',
  keyGenerator: userKey,
})

export const threadCreateRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Limite de novas conversas atingido. Tente novamente mais tarde.',
  keyGenerator: userKey,
})
