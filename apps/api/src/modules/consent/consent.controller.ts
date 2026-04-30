import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'

/**
 * Versao da politica de cookies actualmente em vigor. Incrementar
 * (ISO date) sempre que adicionarmos/removermos categorias ou
 * mudarmos vendors. Forca re-consent dos utilizadores.
 */
export const COOKIE_CONSENT_VERSION = '2026-04-30'

/**
 * Body do POST /api/consent/cookies — categorias suportadas.
 * `necessary` esta sempre implicito a true (cookies essenciais nao
 * carecem de consentimento RGPD), mas aceitamos no payload por
 * coerencia com o front e auditabilidade.
 */
export const cookieConsentBodySchema = z.object({
  anonId: z.string().uuid({ message: 'anonId deve ser UUID' }),
  decision: z.object({
    necessary: z.literal(true),
    analytics: z.boolean(),
    marketing: z.boolean(),
  }),
})

export type CookieConsentBody = z.infer<typeof cookieConsentBodySchema>

/**
 * POST /api/consent/cookies
 * Endpoint publico (auth opcional). Regista a decisao de cookies para
 * audit trail RGPD (CNPD). Utilizadores autenticados ficam ligados
 * ao seu userId; visitantes ficam apenas com anonId.
 */
export const recordCookieConsent = asyncHandler(async (req, res) => {
  const body = req.body as CookieConsentBody
  const userId = req.user?.userId ?? null

  // IP real (atras de proxy reverso). trust proxy ja' esta ligado em
  // index.ts pelo que req.ip respeita X-Forwarded-For.
  const ip = req.ip?.slice(0, 45) ?? null
  const ua = req.headers['user-agent']?.slice(0, 500) ?? null

  await prisma.cookieConsentLog.create({
    data: {
      anonId: body.anonId,
      userId,
      decision: body.decision,
      version: COOKIE_CONSENT_VERSION,
      ipAddress: ip,
      userAgent: ua,
    },
    select: { id: true },
  })

  res.status(204).end()
})
