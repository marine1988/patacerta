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
