# PataCerta

Plataforma de **criadores de cães verificados** e **serviços pet** em Portugal.
Em produção: https://patacerta.pt

> **És um agente de IA?** Lê primeiro o [`AGENTS.md`](./AGENTS.md) — contém as
> regras operacionais obrigatórias (comandos, git, zonas proibidas, validação).

---

## Stack

Monorepo pnpm com 3 workspaces:

| Workspace           | Caminho           | Stack                                                             |
| ------------------- | ----------------- | ----------------------------------------------------------------- |
| `@patacerta/api`    | `apps/api`        | Express 4 · Prisma 5 · PostgreSQL 16 · Redis · MinIO              |
| `@patacerta/web`    | `apps/web`        | React 18 · Vite 5 · TailwindCSS · React Router 6 · TanStack Query |
| `@patacerta/shared` | `packages/shared` | Schemas Zod partilhados                                           |

Requisitos: **Node >= 20**, **pnpm 9.12.0** (versão fixada em `package.json`), **Docker**.

---

## Quickstart (desenvolvimento local)

```bash
# 1. Instalar dependências (usa a versão fixada do pnpm)
pnpm install

# 2. Configurar ambiente
cp .env.example .env

# 3. Arrancar infraestrutura (Postgres + Redis + MinIO)
pnpm docker:up

# 4. Criar schema + dados base (distritos, raças, admin)
pnpm db:migrate
pnpm db:seed

# 5. Arrancar API + Web em paralelo
pnpm dev
```

Acessos:

- Frontend: http://localhost:5173
- API: http://localhost:3001/api
- Prisma Studio: `pnpm db:studio` → http://localhost:5555
- MinIO Console: http://localhost:9001

---

## Comandos principais

| Comando                                     | Descrição                                                     |
| ------------------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                                  | Arranca API + Web                                             |
| `pnpm typecheck`                            | `tsc --noEmit` (**fonte de verdade** — corre antes de commit) |
| `pnpm format:check`                         | Verifica formatação Prettier                                  |
| `pnpm format`                               | Formata o código                                              |
| `pnpm lint`                                 | ESLint (advisory — warnings não quebram; não está no CI)      |
| `pnpm build`                                | Build de produção                                             |
| `pnpm --filter @patacerta/api test`         | Testes unitários da API (Vitest)                              |
| `pnpm --filter @patacerta/web test:e2e`     | Testes E2E (Playwright)                                       |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Base de dados (dev local)                                     |

> **Nota:** `pnpm lint` (ESLint) é uma rede de segurança _advisory_ — warnings não
> quebram o build e o lint não está no CI. A validação obrigatória é
> `pnpm typecheck && pnpm format:check`.

---

## Testes E2E (Playwright)

```bash
# Pré-requisitos: pnpm docker:up + pnpm db:migrate + pnpm db:seed + db:seed:demo
pnpm --filter @patacerta/web test:e2e:install   # primeira vez (instala browsers)
pnpm --filter @patacerta/web test:e2e
```

Ver [`apps/web/e2e/README.md`](./apps/web/e2e/README.md). Em CI, o workflow
`.github/workflows/e2e.yml` arranca a stack completa e corre a suite.

---

## Documentação

| Documento                                                            | Conteúdo                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`AGENTS.md`](./AGENTS.md)                                           | **Regras para agentes de IA** (ler primeiro)                             |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                     | Arquitetura, stack, fluxos, padrões                                      |
| [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)                       | Setup local, comandos, testes, debugging                                 |
| [`docs/API.md`](./docs/API.md)                                       | Endpoints, autenticação, middlewares, erros                              |
| [`docs/DATABASE.md`](./docs/DATABASE.md)                             | Schema, entidades, enums, índices                                        |
| [`docs/DATABASE_BOOT_STRATEGY.md`](./docs/DATABASE_BOOT_STRATEGY.md) | Como a DB é preparada no arranque (**ler antes de tocar em migrations**) |
| [`docs/ENVIRONMENT_VARIABLES.md`](./docs/ENVIRONMENT_VARIABLES.md)   | Referência única de todas as variáveis de ambiente                       |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)                         | Deploy Dokploy, env vars, backups, manutenção                            |
| [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md)               | Sintomas → causa → solução (diagnóstico central)                         |
| [`docs/PRODUCTION_CHECKLIST.md`](./docs/PRODUCTION_CHECKLIST.md)     | Checklist pré-lançamento                                                 |
| [`docs/RESTORE.md`](./docs/RESTORE.md)                               | Disaster recovery / restore de backups                                   |
| [`docs/stripe-runbook.md`](./docs/stripe-runbook.md)                 | Operações e troubleshooting de pagamentos                                |
| [`docs/ADSENSE_SETUP.md`](./docs/ADSENSE_SETUP.md)                   | Configuração de publicidade (AdSense + RGPD)                             |

---

## Ambientes

| Ambiente | URL                        | Branch | Deploy                            |
| -------- | -------------------------- | ------ | --------------------------------- |
| Produção | https://patacerta.pt       | `main` | Automático via Dokploy (~3-5 min) |
| Stage    | https://stage.patacerta.pt | `dev`  | Automático via Dokploy            |

A API é servida no mesmo domínio via proxy nginx (`/api/*`).

---

## Licença

Privado — © PataCerta. Todos os direitos reservados.
