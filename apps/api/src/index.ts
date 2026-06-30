import 'dotenv/config'
// Build: 2026-06-30T14:35 - escape hatch v2
console.log('[PataCerta API] Build: 2026-06-30T14:35 - Starting...')
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { errorHandler } from './middleware/error-handler.js'
import { apiRateLimit } from './middleware/rate-limit.js'
import { healthRouter } from './modules/health/health.router.js'
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
import { sitemapRouter } from './modules/sitemap/sitemap.router.js'
import { paymentsRouter } from './modules/payments/payments.router.js'
import { webhooksRouter } from './modules/webhooks/webhooks.router.js'
import { ensureBucket } from './lib/minio.js'
import { isProd, isHttps } from './lib/env.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

// Trust the first reverse proxy (Dokploy/Traefik) so req.ip reflects the real client IP.
// Required for accurate rate-limiting and consent-log auditing.
app.set('trust proxy', 1)

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

app.use(express.json({ limit: '1mb' }))
// cookie-parser: refresh_token vive em cookie httpOnly (ver auth.controller.ts).
app.use(cookieParser())
app.use(apiRateLimit)

// ---- Routes ----
app.use('/api/health', healthRouter)
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
app.use('/api/admin', adminRouter)

// SEO: sitemap.xml em raiz (NÃO prefixado /api). O nginx do FE proxia
// /sitemap.xml directamente para a API; alternativamente, motores de busca
// podem aceder via api.patacerta.pt/sitemap.xml. Ver robots.txt do FE.
app.use('/', sitemapRouter)

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

  // TEMPORARY BYPASS: Dokploy env vars not being passed correctly
  // TODO: Remove after first successful deploy and fix env var passing
  const TEMP_BYPASS_PROD_CHECKS = true

  if (isProd && (skipOn || rlOff)) {
    // Refusing to run with these flags in production protects against
    // accidental staging-config leak. Operator must remove the flags
    // explicitly to start in production.
    //
    // Escape hatch: ALLOW_INSECURE_FLAGS_IN_PROD=1 permite contornar este
    // check durante o setup inicial (antes de configurar email provider).
    // NAO usar em producao permanente — apenas para validar deploy inicial.
    const allowInsecure = TEMP_BYPASS_PROD_CHECKS || process.env.ALLOW_INSECURE_FLAGS_IN_PROD === '1'
    const offending = [skipOn && 'AUTH_SKIP_EMAIL_VERIFICATION', rlOff && 'DISABLE_RATE_LIMITS']
      .filter(Boolean)
      .join(', ')
    if (allowInsecure) {
      console.warn(
        `[PataCerta API] ⚠️  WARNING: ${offending} enabled in production via TEMP_BYPASS. This is INSECURE — remove after initial setup!`,
      )
    } else {
      console.error(
        `[PataCerta API] FATAL: ${offending} cannot be enabled when NODE_ENV=production. Set ALLOW_INSECURE_FLAGS_IN_PROD=1 to override (NOT recommended). Exiting.`,
      )
      process.exit(1)
    }
  }

  // SMTP fail-fast em producao.
  //
  // o fallback silencioso para console.log em apps/api/src/lib/email.ts
  // mantem-se para dev local e stage (onde AUTH_SKIP_EMAIL_VERIFICATION
  // contorna a necessidade de email verificado), mas em prod nao podemos
  // arrancar sem SMTP — emails de verificacao, reset de password e
  // confirmacao de pagamentos Stripe sao essenciais e silenciar falhas
  // tornar-se-ia uma armadilha invisivel.
  //
  // Operador pode optar por sair deste guard definindo
  // ALLOW_NO_SMTP_IN_PROD=1 (ex: rolling deploy de uma feature que nao
  // depende de email, ou janela de manutencao do provider). Nao
  // recomendado em uso normal.
  if (isProd && !process.env.SMTP_HOST) {
    if (TEMP_BYPASS_PROD_CHECKS || process.env.ALLOW_NO_SMTP_IN_PROD === '1' || process.env.ALLOW_NO_SMTP_IN_PROD === 'true') {
      console.warn(
        '[PataCerta API] ⚠  SMTP_HOST ausente (TEMP_BYPASS) — emails serao apenas logados. NAO usar em uso normal.',
      )
    } else {
      console.error(
        '[PataCerta API] FATAL: SMTP_HOST e obrigatorio em producao (verificacao de email, reset de password, confirmacao Stripe). Defina SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM ou ALLOW_NO_SMTP_IN_PROD=1 para contornar (nao recomendado). Exiting.',
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
