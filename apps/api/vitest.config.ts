import { defineConfig } from 'vitest/config'

/**
 * Configuração mínima de Vitest para a API. Foca-se em testes
 * unitários por agora — sem DB real, sem Redis, sem MinIO. Quando
 * adicionarmos integration tests com supertest será preciso:
 *
 *   1. Extrair `app` para `src/app.ts` (sem `app.listen`).
 *   2. Setup file que chame `prisma migrate deploy` contra um Postgres
 *      de test (docker compose ou container ad-hoc).
 *   3. Ajustar `pool` para `forks` (Prisma + ESM tem fricção em
 *      `threads` por causa do native binding).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Prisma engine + ESM — forks evita problemas de re-import do binding.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Sem coverage por defeito; activar com `vitest run --coverage`.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/jobs/**'],
    },
  },
})
