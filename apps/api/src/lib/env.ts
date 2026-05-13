/**
 * Distincao entre "producao" (semantica de seguranca: fail-fast em flags
 * de debug, CORS obrigatorio) e "ambiente HTTPS" (cookie Secure, HSTS).
 *
 * Stage corre HTTPS atras de Traefik mas mantem flags de debug ligadas
 * (AUTH_SKIP_EMAIL_VERIFICATION, DISABLE_RATE_LIMITS) — pelo que precisa
 * de cookies Secure e HSTS sem disparar os fail-fasts de producao.
 *
 *   isProd  -> NODE_ENV=production       (guards estritos)
 *   isStage -> NODE_ENV=stage             (HTTPS + flags de debug)
 *   isHttps -> isProd || isStage          (cookie Secure + HSTS)
 */
export const isProd = process.env.NODE_ENV === 'production'
export const isStage = process.env.NODE_ENV === 'stage'
export const isHttps = isProd || isStage

/**
 * URL base do frontend, usada em emails (verificacao, reset de password),
 * links absolutos do sitemap e success/cancel URLs do Stripe Checkout.
 *
 * `FRONTEND_URL` pode ser uma lista separada por virgulas (consistente com
 * `CORS_ORIGIN`), caso em que devolvemos a primeira entrada (dominio
 * canonico) por ser estavel — outras entradas servem so para CORS.
 *
 * O fallback `http://localhost:5173` so e' tolerado em desenvolvimento —
 * em producao/stage temos de falhar de imediato se a variavel nao estiver
 * definida, caso contrario o operador envia silenciosamente emails com
 * links para localhost (e o Stripe redirecciona para um endereco invalido).
 */
export function getFrontendBaseUrl(): string {
  const raw = process.env.FRONTEND_URL?.split(',')[0]?.trim()
  if (raw && raw.length > 0) return raw
  if (isHttps) {
    // Em prod/stage, falhamos a request com um erro claro (vai parar ao
    // error-handler e devolve 500). E' melhor que enviar um email com
    // link para localhost que silenciosamente partiria a UX.
    throw new Error(
      '[PataCerta] FRONTEND_URL nao definido — necessario para construir URLs de email/checkout em producao/stage.',
    )
  }
  return 'http://localhost:5173'
}
