import 'dotenv/config'
// Build: 2026-06-30T16:15 - fixed migrations
console.log('[PataCerta API] Build: 2026-06-30T16:15 - Starting...')
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { errorHandler } from './middleware/error-handler.js'
import { apiRateLimit } from './middleware/rate-limit.js'
import { healthRouter, statusRouter } from './modules/health/health.router.js'
import { authRouter } from './modules/auth/auth.router.js'
import { usersRouter } from './modules/users/users.router.js'
import { breedersRouter } from './modules/breeders/breeders.router.js'
import { verificationRouter } from './modules/verification/verification.router.js'
import { searchRouter } from './modules/search/search.router.js'
import { reviewsRouter } from './modules/reviews/reviews.router.js'
import { messagesRouter } from './modules/messages/messages.router.js'
import { adminRouter } from './modules/admin/admin.router.js'
import { servicesRouter } from './modules/services/services.router.js'
import { serviceReviewsRouter } from './modules/service-reviews/service-reviews.router.js'
import { homeRouter } from './modules/home/home.router.js'
import { breedMatcherRouter } from './modules/breed-matcher/breed-matcher.router.js'
import { breedsRouter } from './modules/breeds/breeds.router.js'
import { sponsoredSlotsRouter } from './modules/sponsored-slots/sponsored-slots.router.js'
import { consentRouter } from './modules/consent/consent.router.js'
import { feedbackRouter } from './modules/feedback/feedback.router.js'
import { sitemapRouter } from './modules/sitemap/sitemap.router.js'
import { paymentsRouter } from './modules/payments/payments.router.js'
import { webhooksRouter } from './modules/webhooks/webhooks.router.js'
import { ensureBucket } from './lib/minio.js'
import { isProd, isStage, isDev, isHttps } from './lib/env.js'
import { maintenanceMode } from './middleware/maintenance.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

// Trust the reverse proxy (Dokploy/Traefik) so req.ip reflects the real client IP.
// Required for accurate rate-limiting and consent-log auditing.
//
// CVE-2026-90711: proxy-addr <2.0.8 did not recognise IPv4-mapped IPv6
// addresses in the trusted subnet, allowing an attacker to send
// `X-Forwarded-For: ::ffff:127.0.0.1` and have it treated as a trusted/
// loopback client IP, bypassing rate limits and corrupting audit logs.
//
// Hardening:
//  1. proxy-addr bumped to >=2.0.8 (pnpm override in pnpm-workspace.yaml).
//  2. Trust is a CUSTOM function instead of a hop count: we only trust the
//     immediate proxy when its socket address is a known proxy (loopback or
//     RFC1918/private range), and we NEVER trust an IPv4-mapped IPv6
//     address (`::ffff:`) in any position.
//  3. Any client IP that still resolves to an IPv4-mapped IPv6 is normalised
//     back to the socket address by the middleware below, so it can never be
//     used as a rate-limit key or stored in audit/consent logs.
function isTrustedProxyAddress(ip: string): boolean {
  if (typeof ip !== 'string' || ip.length === 0) return false
  const lower = ip.toLowerCase()
  // Never trust IPv4-mapped IPv6 (CVE-2026-90711).
  if (lower.startsWith('::ffff:')) return false

  // Loopback.
  if (ip === '127.0.0.1' || ip === '::1') return true

  // IPv4 private / link-local ranges (Traefik runs inside Docker).
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
  }

  // IPv6 unique-local / link-local.
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('fe80:')) return true

  return false
}

app.set('trust proxy', (ip: string, i: number) => {
  // Only the immediate reverse proxy (1 hop) may be trusted.
  if (i > 0) return false
  return isTrustedProxyAddress(ip)
})

// Strip any IPv4-mapped IPv6 that slipped through into req.ip so it can
// never be used as a rate-limit key or persisted in audit/consent logs.
app.use((req, _res, next) => {
  const ip = req.ip
  if (typeof ip === 'string' && ip.toLowerCase().startsWith('::ffff:')) {
    const fallback = req.socket?.remoteAddress || ip
    Object.defineProperty(req, 'ip', {
      value: fallback,
      writable: true,
      configurable: true,
    })
  }
  next()
})

// ---- Global Middleware ----
// Security headers. CSP is API-focused (no HTML rendered), so we keep defaults
// but disable the cross-origin embedder policy that breaks JSON consumers.
//
// HSTS: forcamos 1 ano + includeSubDomains + preload em qualquer ambiente
// HTTPS (producao + stage). Helmet ja injecta HSTS por defeito mas com
// configuracao mais conservadora; aqui assumimos a politica completa.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: isHttps
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  }),
)

// Permissions-Policy: API JSON nao precisa de capabilities do browser.
// Helmet 7 ainda nao injecta este header por defeito, entao fazemo-lo
// explicitamente para neutralizar permissoes default caso uma resposta
// seja embedida em contextos inesperados (iframe, fetch from extensions).
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=(), usb=(), fullscreen=()',
  )
  next()
})

// ---- Maintenance Mode ----
// Returns 503 for all requests when MAINTENANCE_MODE=1 (except /api/health).
// Toggle in Dokploy without rebuild. Bypass with X-Maintenance-Bypass header.
app.use(maintenanceMode)
if (process.env.MAINTENANCE_MODE === '1' || process.env.MAINTENANCE_MODE === 'true') {
  console.log('[PataCerta API] ⚠️  MAINTENANCE_MODE enabled — returning 503 for all requests')
}

// CORS: aceita lista separada por virgulas em CORS_ORIGIN.
// - Se CORS_ORIGIN nao estiver definido, recai sobre FRONTEND_URL — que
//   ja existe para construir links de email. Evita ter de duplicar o
//   mesmo dominio em duas variaveis em cada deploy.
// - Em producao, pelo menos uma das duas tem de estar definida (fail-fast).
// - '*' com credentials e' rejeitado pelo proprio navegador, mas
//   recusamos em config-time para detectar config-leak cedo.
// - origin null (file://, sandboxed iframes) e' aceite apenas em dev
//   (mais abaixo, pedidos sem Origin header passam).
const rawCors =
  process.env.CORS_ORIGIN || process.env.FRONTEND_URL || (isProd ? '' : 'http://localhost:5173')
const corsOrigins = rawCors
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
if (isProd && corsOrigins.length === 0) {
  throw new Error(
    '[PataCerta] CORS_ORIGIN ou FRONTEND_URL obrigatorio em producao. Defina dominio(s) permitido(s).',
  )
}
if (corsOrigins.includes('*')) {
  throw new Error(
    '[PataCerta] CORS_ORIGIN=* nao e permitido (credentials enabled). Use o dominio exacto do FE.',
  )
}
console.log(`[PataCerta API] CORS allowlist: ${corsOrigins.join(', ')}`)

// ---- Admin password (H-01) ----
// Em prod/stage, ADMIN_PASSWORD tem de estar definido e ser forte. Falha
// cedo (boot) em vez de criar/aceitar um admin com password fraca/conhecida.
if (isProd || isStage) {
  const adminPass = process.env.ADMIN_PASSWORD
  const strong =
    !!adminPass &&
    adminPass.length >= 12 &&
    /[A-Z]/.test(adminPass) &&
    /[a-z]/.test(adminPass) &&
    /[0-9]/.test(adminPass) &&
    /[^A-Za-z0-9]/.test(adminPass)
  if (!strong) {
    throw new Error(
      '[PataCerta] ADMIN_PASSWORD obrigatorio em prod/stage e tem de ter >=12 chars ' +
        'com maiusculas, minusculas, digitos e um caractere especial (H-01).',
    )
  }
}
app.use(
  cors({
    origin: (origin, cb) => {
      // Pedidos same-origin / curl / health checks nao tem origin: aceita-os.
      if (!origin) return cb(null, true)
      if (corsOrigins.includes(origin)) return cb(null, true)
      cb(new Error(`CORS bloqueado: origem ${origin} nao autorizada`))
    },
    credentials: true,
  }),
)

// ⚠ Stripe webhooks: precisa do body raw para validar a assinatura, por
// isso é montado ANTES de express.json(). Caso contrário o middleware
// global converte para JSON e perdemos o Buffer original.
app.use('/api/webhooks', webhooksRouter)

// CVE-2026-111181: body-parser <1.20.9 (1.x) / <2.4.0 (2.x) leaves the
// decompression stream piped with no error listener after reading a
// compressed body, so trailing bytes after a valid gzip/deflate frame emit an
// uncaught exception and crash the process. Fixed by pinning body-parser to
// 1.20.9 via pnpm override (pnpm-workspace.yaml) — express 4.22.3's own
// range (~1.20.5) already resolves to 1.20.9, but the override guarantees the
// patched release even if the express range changes. inflate stays enabled
// (default) so legitimate compressed requests keep working.
app.use(express.json({ limit: '1mb' }))
// cookie-parser: refresh_token vive em cookie httpOnly (ver auth.controller.ts).
app.use(cookieParser())
app.use(apiRateLimit)

// ---- Routes ----
app.use('/api/health', healthRouter)
app.use('/api/status', statusRouter) // Frontend usa para detectar manutenção (sem bypass)
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/breeders', breedersRouter)
app.use('/api/verification', verificationRouter)
app.use('/api/search', searchRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/services', servicesRouter)
app.use('/api/service-reviews', serviceReviewsRouter)
app.use('/api/home', homeRouter)
app.use('/api/breed-matcher', breedMatcherRouter)
app.use('/api/breeds', breedsRouter)
app.use('/api/sponsored-slots', sponsoredSlotsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/consent', consentRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/admin', adminRouter)

// SEO: sitemap.xml em raiz (NÃO prefixado /api). O nginx do FE proxia
// /sitemap.xml directamente para a API; alternativamente, motores de busca
// podem aceder via api.patacerta.pt/sitemap.xml. Ver robots.txt do FE.
app.use('/', sitemapRouter)

// ---- Fallback JSON para rotas /api/* desconhecidas ----
// Sem isto o Express responde com a sua pagina HTML por defeito
// (<pre>Cannot GET /api/search/services</pre>, content-type text/html) e um
// cliente que faca res.json() sob o prefixo /api/* rebenta com erro de parse
// em vez de receber {error, code} — inconsistente com o resto da API, que usa
// AppError + {error, code}. Tem de vir DEPOIS de todas as rotas montadas
// (senao interceptava-as) e ANTES do errorHandler (que continua a ser o
// ultimo middleware, para apanhar erros propagados por next(err)).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Recurso não encontrado', code: 'NOT_FOUND' })
})

// ---- Error handler (must be last) ----
app.use(errorHandler)

// Ensure the MinIO bucket exists before accepting requests.
// Best-effort: if MinIO is momentarily unavailable we log and continue —
// uploads will fail until the bucket is provisioned, but the rest of the
// API stays functional (auth, listings, etc.).
ensureBucket()
  .then(() => console.log('[PataCerta API] MinIO bucket OK'))
  .catch((err) => console.error('[PataCerta API] MinIO bucket setup failed:', err))

// Bind explicito a 0.0.0.0 para garantir IPv4 acessivel a healthchecks Docker
// (alguns ambientes node:20-alpine fazem bind dual-stack inconsistente quando
// host e' omitido, causando wget http://127.0.0.1 a falhar mesmo com servidor a correr).
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PataCerta API] Running on http://localhost:${PORT}`)
  console.log(`[PataCerta API] Environment: ${process.env.NODE_ENV || 'development'}`)

  const skipFlag = process.env.AUTH_SKIP_EMAIL_VERIFICATION
  const rlFlag = process.env.DISABLE_RATE_LIMITS
  const skipOn = skipFlag === '1' || skipFlag === 'true' || skipFlag === 'TRUE'
  const rlOff = rlFlag === '1' || rlFlag === 'true' || rlFlag === 'TRUE'

  if (isProd && (skipOn || rlOff)) {
    // Refusing to run with these flags in production protects against
    // accidental staging-config leak. Operator must remove the flags
    // explicitly to start in production.
    //
    // Escape hatch: ALLOW_INSECURE_FLAGS_IN_PROD=1 permite contornar este
    // check durante o setup inicial (antes de configurar email provider).
    // NAO usar em producao permanente — apenas para validar deploy inicial.
    const allowInsecure = process.env.ALLOW_INSECURE_FLAGS_IN_PROD === '1'
    const offending = [skipOn && 'AUTH_SKIP_EMAIL_VERIFICATION', rlOff && 'DISABLE_RATE_LIMITS']
      .filter(Boolean)
      .join(', ')
    if (allowInsecure) {
      console.warn(
        `[PataCerta API] ⚠️  WARNING: ${offending} enabled in production via ALLOW_INSECURE_FLAGS_IN_PROD=1. This is INSECURE — remove after initial setup!`,
      )
    } else {
      console.error(
        `[PataCerta API] FATAL: ${offending} cannot be enabled when NODE_ENV=production. Set ALLOW_INSECURE_FLAGS_IN_PROD=1 to override (NOT recommended). Exiting.`,
      )
      process.exit(1)
    }
  }

  // Aviso em ambientes nao-dev (stage) quando as flags de conveniencia de
  // testes estao activas. Stage corre com AUTH_SKIP_EMAIL_VERIFICATION=true e
  // (por omissao) DISABLE_RATE_LIMITS=true para facilitar smoke tests, mas
  // isso desactiva verificacao de email e rate limiting — inseguro se o stage
  // for usado para demos/QA com dados reais. O aviso torna o risco visivel
  // no boot em vez de silencioso.
  if (!isDev && (skipOn || rlOff)) {
    const offending = [skipOn && 'AUTH_SKIP_EMAIL_VERIFICATION', rlOff && 'DISABLE_RATE_LIMITS']
      .filter(Boolean)
      .join(', ')
    console.warn(
      `[PataCerta API] ⚠  Ambiente nao-dev (${isStage ? 'stage' : 'prod'}) com flags de teste activas: ${offending}. ` +
        `Stage nao deve conter dados reais; para demos/QA com utilizadores reais desactivar estas flags ` +
        `(AUTH_SKIP_EMAIL_VERIFICATION=false, DISABLE_RATE_LIMITS=false).`,
    )
    if (rlOff) {
      console.warn(
        '[PataCerta API] ⚠  DISABLE_RATE_LIMITS=true — todos os rate limiters sao no-ops (brute-force/abuso sem proteccao).',
      )
    }
  }

  // Resend API key fail-fast em producao.
  //
  // o fallback silencioso para console.log em apps/api/src/lib/email.ts
  // mantem-se para dev local e stage (onde AUTH_SKIP_EMAIL_VERIFICATION
  // contorna a necessidade de email verificado), mas em prod nao podemos
  // arrancar sem email configurado — emails de verificacao, reset de password e
  // confirmacao de pagamentos Stripe sao essenciais e silenciar falhas
  // tornar-se-ia uma armadilha invisivel.
  //
  // Operador pode optar por sair deste guard definindo
  // ALLOW_NO_SMTP_IN_PROD=1 (ex: rolling deploy de uma feature que nao
  // depende de email, ou janela de manutencao do provider). Nao
  // recomendado em uso normal.
  if (isProd && !process.env.RESEND_API_KEY) {
    if (process.env.ALLOW_NO_SMTP_IN_PROD === '1' || process.env.ALLOW_NO_SMTP_IN_PROD === 'true') {
      console.warn(
        '[PataCerta API] ⚠  ALLOW_NO_SMTP_IN_PROD=1 e RESEND_API_KEY ausente — emails serao apenas logados. NAO usar em uso normal.',
      )
    } else {
      console.error(
        '[PataCerta API] FATAL: RESEND_API_KEY e obrigatorio em producao (verificacao de email, reset de password, confirmacao Stripe). Defina RESEND_API_KEY ou ALLOW_NO_SMTP_IN_PROD=1 para contornar (nao recomendado). Exiting.',
      )
      process.exit(1)
    }
  }

  if (skipOn) {
    console.warn(
      '[PataCerta API] ⚠  AUTH_SKIP_EMAIL_VERIFICATION=true — email verification bypassed (do NOT use in production)',
    )
  }
  if (rlOff) {
    console.warn(
      '[PataCerta API] ⚠  DISABLE_RATE_LIMITS=true — all rate limiters are no-ops (do NOT use in production)',
    )
  }
})

export { app }
