import { Router } from 'express'
import { optionalAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { cookieConsentBodySchema, recordCookieConsent } from './consent.controller.js'

export const consentRouter = Router()

// POST /api/consent/cookies — publico (auth opcional). Registar
// decisao do banner CMP. Persistido em cookie_consent_logs.
consentRouter.post('/cookies', optionalAuth, validate(cookieConsentBodySchema), recordCookieConsent)
