import type { Request, Response, NextFunction } from 'express'
import { getRedis } from '../lib/redis.js'

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number }
}

// In-process fallback used when Redis is unavailable. Single-instance only;
// for multi-instance production deployments, set REDIS_URL.
const memoryStore: RateLimitStore = {}

// Periodic cleanup of expired in-memory entries.
setInterval(
  () => {
    const now = Date.now()
    for (const key of Object.keys(memoryStore)) {
      if (memoryStore[key].resetAt <= now) delete memoryStore[key]
    }
  },
  5 * 60 * 1000,
)

interface RateLimitOptions {
  windowMs?: number
  max?: number
  message?: string
  keyGenerator?: (req: Request) => string
  /**
   * Bucket name used to namespace Redis keys. Defaults to 'default'. Use a
   * distinct name per limiter so different policies don't share counters.
   */
  bucket?: string
}

/**
 * When true, all rate limiters become no-ops. Controlled by DISABLE_RATE_LIMITS
 * env var. MUST remain false/unset in production.
 */
function rateLimitsDisabled(): boolean {
  const v = process.env.DISABLE_RATE_LIMITS
  return v === '1' || v === 'true' || v === 'TRUE'
}

interface HitResult {
  count: number
  resetAt: number
}

/**
 * Atomic INCR + EXPIRE in Redis. On the first hit within a window we set the
 * TTL; subsequent hits just increment. Failures throw and let the caller
 * fall back to the in-memory store, so a flaky Redis never takes the API down.
 */
async function redisHit(key: string, windowMs: number): Promise<HitResult | null> {
  const redis = getRedis()
  if (!redis) return null

  const redisKey = `rl:${key}`
  // Use a pipeline for INCR + PTTL so we know if this is a fresh window.
  const pipeline = redis.multi()
  pipeline.incr(redisKey)
  pipeline.pttl(redisKey)
  const results = await pipeline.exec()
  if (!results) throw new Error('redis pipeline returned null')

  const [incrErr, count] = results[0]
  const [pttlErr, pttl] = results[1]
  if (incrErr) throw incrErr
  if (pttlErr) throw pttlErr

  let ttlMs = typeof pttl === 'number' ? pttl : -1
  // First hit (or key without TTL): set the window expiry.
  if (ttlMs < 0) {
    await redis.pexpire(redisKey, windowMs)
    ttlMs = windowMs
  }

  return {
    count: typeof count === 'number' ? count : Number(count),
    resetAt: Date.now() + ttlMs,
  }
}

function memoryHit(key: string, windowMs: number): HitResult {
  const now = Date.now()
  const entry = memoryStore[key]
  if (!entry || entry.resetAt <= now) {
    memoryStore[key] = { count: 1, resetAt: now + windowMs }
  } else {
    entry.count++
  }
  return memoryStore[key]
}

/**
 * Rate limiter middleware. Uses Redis when REDIS_URL is configured (required
 * for multi-instance deployments), otherwise falls back to an in-process Map.
 * If Redis is configured but momentarily unhealthy, this falls back to the
 * in-process store rather than failing the request — security over availability
 * trade-off favours availability for short Redis blips, since the fallback
 * still rate-limits per-instance.
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Demasiados pedidos. Tente novamente mais tarde.',
    keyGenerator = (req: Request) => req.ip || 'unknown',
    bucket = 'default',
  } = options

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (rateLimitsDisabled()) {
      next()
      return
    }

    const key = `${bucket}:${keyGenerator(req)}`

    let hit: HitResult
    try {
      const redisResult = await redisHit(key, windowMs)
      hit = redisResult ?? memoryHit(key, windowMs)
    } catch {
      // Redis blip — degrade to per-instance memory store.
      hit = memoryHit(key, windowMs)
    }

    const remaining = Math.max(0, max - hit.count)
    res.set('X-RateLimit-Limit', String(max))
    res.set('X-RateLimit-Remaining', String(remaining))
    res.set('X-RateLimit-Reset', String(Math.ceil(hit.resetAt / 1000)))

    if (hit.count > max) {
      res.status(429).json({ error: message, code: 'RATE_LIMITED' })
      return
    }

    next()
  }
}

// Pre-configured rate limiters
//
// Os endpoints de auth tem perfis de abuso diferentes:
// - login/register: alvo de brute-force, queremos limites apertados.
// - refresh: chamado a cada ~15min em uso normal por cada cliente
//   autenticado. Um limite global agressivo aqui ataca utilizadores
//   legitimos quando varios separadores estao abertos.
// - resend-verification / forgot-password / reset-password: cada um tem
//   ja o seu controlo (token + email-rate-limit) mas queremos protecao
//   IP separada para nao partilharem o balde do login.
//
// Mantemos `authRateLimit` exportado para back-compat (nao e usado mas
// pode estar referenciado). Em producao usar os granulares abaixo.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiadas tentativas de autenticação. Tente em 15 minutos.',
  bucket: 'auth',
})

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiadas tentativas de início de sessão. Tente em 15 minutos.',
  bucket: 'auth-login',
})

export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Demasiadas contas criadas a partir deste IP. Tente em 1 hora.',
  bucket: 'auth-register',
})

export const refreshRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Demasiadas renovações de sessão. Aguarde alguns minutos.',
  bucket: 'auth-refresh',
})

export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiadas tentativas de reposição. Tente em 1 hora.',
  bucket: 'auth-pw-reset',
})

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  bucket: 'api',
})

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Limite de uploads atingido. Tente novamente em 1 hora.',
  bucket: 'upload',
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
  bucket: 'review-create',
})

export const reviewFlagRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiadas denúncias. Tente novamente mais tarde.',
  keyGenerator: userKey,
  bucket: 'review-flag',
})

export const messageSendRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Está a enviar mensagens demasiado depressa. Aguarde um momento.',
  keyGenerator: userKey,
  bucket: 'message-send',
})

export const threadCreateRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Limite de novas conversas atingido. Tente novamente mais tarde.',
  keyGenerator: userKey,
  bucket: 'thread-create',
})

export const serviceCreateRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  message: 'Limite diário de novos anúncios atingido. Tente novamente amanhã.',
  keyGenerator: userKey,
  bucket: 'service-create',
})

export const serviceReportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Demasiadas denúncias. Tente novamente mais tarde.',
  keyGenerator: userKey,
  bucket: 'service-report',
})

// Protege as mutacoes owner-side de servicos (PATCH/DELETE/publish/pause)
// de abuso ou scripts mal-comportados. Limite generoso — reflecte uso normal.
export const serviceMutationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'Demasiadas alterações ao anúncio. Aguarde um momento.',
  keyGenerator: userKey,
  bucket: 'service-mutation',
})

// Forgot-password tem dois vectores de abuso distintos:
// 1) Atacante usa um IP para martelar emails de varias vitimas (IP-bound).
// 2) Atacante usa varios IPs para bombardear o email de uma so vitima
//    (target-bound — email-bombing). O rate-limit de auth so trata (1).
// Aplicamos ambos os limites ao endpoint para cobrir as duas dimensoes.
const forgotPwEmailKey = (req: Request) => {
  const email = (req.body as { email?: string } | undefined)?.email?.toLowerCase().trim()
  // Quando nao ha email no body, recai sobre IP — o validador Zod a jusante
  // devolve 400 e este hit acaba por ser inocuo.
  return email ? `email:${email}` : `ip:${req.ip || 'unknown'}`
}

export const forgotPasswordEmailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Demasiados pedidos de recuperação para este email. Tente novamente em 1 hora.',
  keyGenerator: forgotPwEmailKey,
  bucket: 'forgot-pw-email',
})
