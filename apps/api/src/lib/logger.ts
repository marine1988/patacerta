import pino from 'pino'
import { isProd } from './env.js'

/**
 * Logger estruturado da API. Em prod usa output JSON (compativel com
 * agregadores como Loki/Datadog); em dev usa pino-pretty se disponivel.
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
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  // Em dev tentamos pino-pretty para output legivel; se nao estiver
  // instalado, pino cai sobre JSON sem partir.
  transport:
    !isProd && process.env.NODE_ENV !== 'test'
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
