/**
 * Setup global de testes Vitest. Carrega .env.test (se existir) e
 * força flags de debug para que helpers que leem `process.env` durante
 * o import (rate-limit, env) não falhem em CI.
 *
 * NOTA: este setup é deliberadamente minimal — não toca em DB nem
 * Redis. Suites unitárias mockam `prisma` directamente; integration
 * tests (futuro) terão um setup adicional.
 */
import 'dotenv/config'

// Defaults para tests; só aplicados se não estiverem já em process.env.
const DEFAULTS: Record<string, string> = {
  NODE_ENV: 'test',
  AUTH_SKIP_EMAIL_VERIFICATION: 'true',
  DISABLE_RATE_LIMITS: 'true',
  JWT_SECRET: 'test-jwt-secret-do-not-use-in-prod',
  JWT_REFRESH_SECRET: 'test-refresh-secret-do-not-use-in-prod',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  // Em ausência de DATABASE_URL não inicializamos prisma directamente,
  // mas algumas suites podem precisar do client lazy. URL fictícia evita
  // que outras libs explodam ao importar.
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
}

for (const [k, v] of Object.entries(DEFAULTS)) {
  if (!process.env[k]) process.env[k] = v
}
