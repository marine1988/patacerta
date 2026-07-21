// ============================================================
// ESLint flat config — PataCerta monorepo
// ============================================================
//
// Baseline PRAGMÁTICA. O código não era linted até agora (177 ficheiros),
// por isso as regras mais ruidosas ficam como `warn` (não falham exit code)
// e as que apanham bugs reais ficam como `error`.
//
// - `pnpm lint`      → eslint . (relatório; warnings não quebram)
// - `pnpm lint:fix`  → eslint . --fix
//
// NOTA: o CI (`.github/workflows/ci.yml`) valida via `typecheck` +
// `format:check`, que continuam a ser a FONTE DE VERDADE. O ESLint é uma
// rede de segurança adicional para feedback local; não está no caminho
// que falha o CI. Ver AGENTS.md §3.
//
// Type-checked rules (que precisam do TS program) NÃO estão ativadas de
// propósito — mantêm o lint rápido e sem necessidade de `parserOptions.project`.
// ============================================================

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  // Ignorados globais
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
      'apps/api/prisma/migrations/**',
      'tmp/**',
    ],
  },

  // Base JS + TypeScript recomendado (não type-checked)
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Regras comuns a todo o TypeScript
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // `no-undef` é desligado em TS por recomendação oficial do
      // typescript-eslint: o próprio `tsc` já valida variáveis indefinidas
      // e esta regra gera falsos positivos com tipos/globais (NodeJS, etc.).
      'no-undef': 'off',

      // Alto sinal (bugs reais) → error
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',

      // Ruído aceitável num código legado → warn (não falha exit code)
      'no-useless-escape': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Backend (Node)
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Frontend (browser + React hooks)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Bloco final (sem filtro de ficheiros → aplica-se a TUDO, incl. .mjs/.js).
  // `no-undef` desligado globalmente: em TS o `tsc` já valida referências
  // indefinidas; nos scripts .mjs de smoke não vale a pena declarar globais.
  {
    rules: {
      'no-undef': 'off',
    },
  },
)
