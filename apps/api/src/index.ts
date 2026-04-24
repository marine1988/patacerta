import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/error-handler.js'
import { apiRateLimit, authRateLimit } from './middleware/rate-limit.js'
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

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

// ---- Global Middleware ----
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(apiRateLimit)

// ---- Routes ----
app.use('/api/health', healthRouter)
app.use('/api/auth', authRateLimit, authRouter)
app.use('/api/users', usersRouter)
app.use('/api/breeders', breedersRouter)
app.use('/api/verification', verificationRouter)
app.use('/api/search', searchRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/services', servicesRouter)
app.use('/api/admin', adminRouter)

// ---- Error handler (must be last) ----
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`[PataCerta API] Running on http://localhost:${PORT}`)
  console.log(`[PataCerta API] Environment: ${process.env.NODE_ENV || 'development'}`)
  const skipFlag = process.env.AUTH_SKIP_EMAIL_VERIFICATION
  if (skipFlag === '1' || skipFlag === 'true' || skipFlag === 'TRUE') {
    console.warn(
      '[PataCerta API] ⚠  AUTH_SKIP_EMAIL_VERIFICATION=true — email verification bypassed (do NOT use in production)',
    )
  }
  const rlFlag = process.env.DISABLE_RATE_LIMITS
  if (rlFlag === '1' || rlFlag === 'true' || rlFlag === 'TRUE') {
    console.warn(
      '[PataCerta API] ⚠  DISABLE_RATE_LIMITS=true — all rate limiters are no-ops (do NOT use in production)',
    )
  }
})

export { app }
