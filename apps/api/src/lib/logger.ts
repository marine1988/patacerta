import pino from 'pino'
import { isHttps } from './env.js'

/**
 * Logger estruturado da API. Em prod/stage usa output JSON (compativel
 * com agregadores como Loki/Datadog); em dev local tenta pino-pretty
 * para output legivel.
 *
 * Niveis disponiveis: trace, debug, info, warn, error, fatal.
 *
 * Convencoes:
 *   logger.info({ userId, route }, 'message')   // contexto estruturado
 *   logger.warn({ err }, 'falhou X')            // erros nao-fatais
 *   logger.error({ err }, 'falhou Y')           // erros que requerem atencao
 *
 * Nao logues PII (emails, nomes, IPs completos). Usa lib/redact.ts
 * (maskEmail) quando precisares de logar identidades.
 *
 * IMPORTANTE: pino-pretty so' e' carregado em dev local (NODE_ENV !=
 * production && != stage && != test). Em prod/stage o pacote nao esta'
 * disponivel na imagem (devDependency) — tentar carrega'-lo ai partia
 * o arranque com `unable to determine transport target for "pino-pretty"`.
 */

// Em prod/stage NUNCA tentar pino-pretty (nao esta' instalado em runtime).
// Em test queremos JSON simples para nao poluir output.
// Em dev local tentamos require.resolve — se faltar, caimos para JSON.
const isDevLocal = !isHttps && process.env.NODE_ENV !== 'test'
let prettyAvailable = false
if (isDevLocal) {
  try {
    // Resolucao sincrona para nao atrasar o arranque.
    // Se pino-pretty nao estiver disponivel (prod build sem devDeps)
    // ficamos com JSON output sem partir.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    require.resolve('pino-pretty')
    prettyAvailable = true
  } catch {
    prettyAvailable = false
  }
}

/**
 * Caminhos redigidos pelo pino.
 *
 * Exportado para o teste correr uma instância de pino sobre a MESMA lista (uma
 * cópia no teste podia divergir da configuração real).
 *
 * O JWT viaja em `X-Access-Token` (ver `ACCESS_TOKEN_HEADER` em
 * middleware/auth.ts, PATA-BUG-12), não em `Authorization`. O `redact` do pino
 * casa pelo nome EXATO do caminho — o genérico `token` não apanha a chave
 * `x-access-token`, por isso ela é listada explicitamente (SEC-06). Hoje nenhum
 * `logger.*` loga o objeto de headers; isto fecha o risco latente. `x-refresh-token`
 * é defensivo: o refresh viaja no cookie `refresh_token` (já coberto por
 * `req.headers.cookie`), mas qualquer header homónimo futuro fica coberto.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-access-token"]',
  'req.headers["x-refresh-token"]',
  'req.headers["X-Access-Token"]',
  'password',
  'passwordHash',
  'token',
]

/** Substituto aplicado a cada caminho sensível. */
export const REDACT_CENSOR = '[REDACTED]'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isHttps ? 'info' : 'debug'),
  transport: prettyAvailable
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  // Redact paths sensiveis caso passem por engano em metadata.
  redact: {
    paths: [...REDACT_PATHS],
    censor: REDACT_CENSOR,
  },
})
