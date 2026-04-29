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
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash', 'token'],
    censor: '[REDACTED]',
  },
})
