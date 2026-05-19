import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// ============================================================
// Vitest config — unit/component tests do FE
// ============================================================
//
// Separado do vite.config.ts para nao misturar config de build com
// config de testes (e' o pattern recomendado em Vite >=5 / Vitest 2).
//
// Pontos importantes:
//
//   - exclude `e2e/**`: o directorio `e2e/` contem specs Playwright
//     (ver playwright.config.ts e o script `test:e2e`). Sem esta
//     exclusao, o Vitest tentava carrega-los, falhava em
//     `test.describe.configure()` (API que existe em Playwright mas
//     nao em Vitest) e `pnpm --filter @patacerta/web test` saia com
//     exit 1 mesmo sem nenhum teste real ter corrido. Os defaults do
//     Vitest ja' excluem `node_modules`, `dist`, etc — so' adicionamos
//     o que e' especifico deste projecto.
//
//   - passWithNoTests: ate' termos a primeira suite de unit tests do
//     FE, queremos que `vitest run` saia 0 quando nao encontra
//     ficheiros — caso contrario CI/scripts de smoke (`pnpm -r test`)
//     ficam vermelhos por uma razao falsa. Removemos esta flag assim
//     que houver pelo menos um *.test.ts(x) no `src/`.
//
//   - environment 'node': default leve, sem deps externas. Quando
//     existir o primeiro teste de componente React, mudar para
//     'jsdom' e adicionar `jsdom` (e opcionalmente
//     `@testing-library/react`) as devDependencies do apps/web.
//
//   - resolve.alias: espelha o que o vite.config.ts faz para o build,
//     para que `@/...` resolva tambem em testes.
// ============================================================

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', '.idea/**', '.git/**'],
    passWithNoTests: true,
  },
})
