# AGENTS.md — Guia Operacional para Agentes de IA

> **LÊ ISTO PRIMEIRO, ANTES DE QUALQUER ALTERAÇÃO.**
> Este ficheiro contém as regras não-negociáveis para trabalhar neste projeto.
> Foi escrito para ser seguido literalmente, sem necessidade de inferência.
> Idioma do projeto e da comunicação: **português de Portugal (pt-PT)**.

---

## 1. O que é este projeto

PataCerta — plataforma de criadores de cães verificados + serviços pet em Portugal.
Está **em produção** em https://patacerta.pt.

Monorepo pnpm com 3 workspaces:

| Workspace | Caminho | Stack |
|-----------|---------|-------|
| `@patacerta/api` | `apps/api` | Express 4 + Prisma 5 + PostgreSQL 16 + Redis + MinIO |
| `@patacerta/web` | `apps/web` | React 18 + Vite 5 + TailwindCSS + React Router 6 |
| `@patacerta/shared` | `packages/shared` | Schemas Zod partilhados |

---

## 2. Comandos essenciais (executa a partir da raiz)

```bash
# Instalar (usa a versão FIXADA do pnpm — não uses outra)
pnpm install

# Desenvolvimento (arranca API + Web em paralelo)
pnpm dev

# VALIDAÇÃO — a FONTE DE VERDADE. Corre SEMPRE antes de commit:
pnpm typecheck        # tsc --noEmit em todos os workspaces
pnpm format:check     # Prettier (verifica formatação)

# Testes
pnpm --filter @patacerta/api test         # Vitest (API)
pnpm --filter @patacerta/web test:e2e      # Playwright (E2E)

# Base de dados (DEV local apenas)
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # dados base (distritos, raças, admin)
pnpm db:studio        # GUI Prisma
```

> **NOTA CRÍTICA sobre pnpm no Windows/PowerShell:** se `pnpm` não estiver no PATH,
> usa `npx.cmd --yes pnpm@9.12.0 <comando>`. A versão está fixada em `package.json`
> (`packageManager: pnpm@9.12.0`). Não uses outra versão.

---

## 3. FONTE DE VERDADE e validação

1. **`pnpm typecheck` (tsc --noEmit) é a fonte de verdade.** Se passa, a mudança é estruturalmente válida.
2. **NÃO existe ESLint configurado.** O script `lint` é um stub (`echo "no lint configured yet"`).
   Não confies em `pnpm lint`. Usa `typecheck` + `format:check`.
3. O CI (`.github/workflows/ci.yml`) corre: `typecheck`, `format:check`, testes API, typecheck+testes Web, build.
   Se o teu objetivo passar nesses passos, estás bom.

**Antes de considerar qualquer tarefa concluída:**
```bash
pnpm typecheck && pnpm format:check
```

---

## 4. Regras de Git (OBRIGATÓRIAS)

- **NUNCA `git add -A` ou `git add .`.** Faz staging EXPLÍCITO ficheiro a ficheiro:
  `git add caminho/exato/ficheiro.ts`
- **Inspeciona antes de commitar:** `git status` + `git diff` + `git log --oneline -5`.
- **NUNCA commites secrets** (`.env`, chaves, tokens).
- Commits multi-linha: escreve a mensagem num ficheiro e usa
  `git commit -F tmp/commit-msg.txt` (UTF-8 sem BOM).
- Só faz `commit`/`push` quando o utilizador pedir explicitamente.
- **NÃO** faças force-push, `git config`, rebase interativo, nem commits vazios sem pedido explícito.

---

## 5. ZONAS PROIBIDAS — não alterar sem entender e sem confirmar

Estas partes quebram silenciosamente ou causam perda de dados:

| Ficheiro / Zona | Porquê é perigoso |
|-----------------|-------------------|
| `apps/api/src/index.ts` — ordem dos middleware | O webhook Stripe usa `express.raw()` que TEM de vir ANTES de `express.json()`. `maintenanceMode` tem de vir cedo. Reordenar quebra pagamentos/manutenção. |
| `apps/api/prisma/migrations/**` | NUNCA edites uma migration já aplicada. Cria uma nova. |
| `apps/api/entrypoint.sh` | Controla o boot da DB. Contém `--accept-data-loss` e `RESET_DB_ON_BOOT` (dropa schema!). Ver `docs/DEPLOYMENT.md`. |
| `apps/api/src/lib/stripe.ts` e `modules/webhooks` | Idempotência e validação de assinatura. Ver `docs/stripe-runbook.md`. |
| `docker-compose.dokploy.yml` | Chaves de env duplicadas quebram o deploy. Verifica unicidade. |
| Qualquer coisa que envolva secrets, migrations destrutivas ou pagamentos | **PÁRA e pergunta ao utilizador.** |

---

## 6. Padrões de código a manter

### API — adicionar/alterar um endpoint (fluxo completo)
1. Schema Zod em `packages/shared/src/` (ou local ao módulo se não for partilhado).
2. Router em `apps/api/src/modules/<feature>/<feature>.router.ts`:
   ```ts
   router.post('/', validate(createXxxSchema), createXxx)
   ```
3. Controller em `<feature>.controller.ts` com `asyncHandler`:
   ```ts
   export const createXxx = asyncHandler(async (req, res) => {
     const data = req.body as z.infer<typeof createXxxSchema>
     const result = await prisma.xxx.create({ data })
     res.status(201).json(result)
   })
   ```
4. Erros SEMPRE via `AppError(status, mensagemPt, 'CODE')` — nunca `throw new Error`.
5. Registar o router em `apps/api/src/index.ts` (respeitando a ordem — ver zona proibida).

### Autorização (compõe middleware)
```ts
router.use(requireAuth, requireRole('ADMIN'), requireActiveUser)
```

### Web — adicionar página
1. Componente em `apps/web/src/pages/<feature>/`.
2. Rota em `apps/web/src/App.tsx` com lazy loading.
3. Data fetching via TanStack Query + `api` (axios) de `apps/web/src/lib/`.

### Regras gerais
- Mensagens ao utilizador final: **pt-PT**.
- `packages/shared` TEM de ser buildado antes da API/Web em CI:
  `pnpm --filter @patacerta/shared build`.
- Não introduzas dependências novas sem necessidade clara.

---

## 7. Debugging rápido

| Sintoma | Onde olhar |
|---------|-----------|
| API não arranca / tabelas não existem | `apps/api/entrypoint.sh`, estado de `_prisma_migrations`, ver `docs/DEPLOYMENT.md` |
| Webhook Stripe 400 "assinatura inválida" | `docs/stripe-runbook.md` §7 |
| Emails não enviados | `RESEND_API_KEY` em falta; `apps/api/src/lib/email.ts` |
| CORS bloqueado | `CORS_ORIGIN`/`FRONTEND_URL` em `apps/api/src/index.ts` |
| Modo manutenção intermitente | Frontend usa `/api/status` (sem bypass), NÃO `/api/health` |
| Restore de backup | `docs/RESTORE.md` |

Logs em produção: Dokploy UI → Logs, ou `docker logs <container> -f`.

---

## 8. Como proceder quando tens incerteza

1. **Lê primeiro** (por ordem): este `AGENTS.md` → `README.md` → `docs/ARCHITECTURE.md`
   → `docs/DEVELOPMENT.md` → o módulo relevante.
2. Se a tarefa envolver **migrations destrutivas, secrets, pagamentos ou deploy** → **PÁRA e pergunta**.
3. Se encontrares uma **contradição na documentação**, sinaliza-a explicitamente em vez de adivinhar.
4. Ao tomares uma decisão técnica nova, **documenta-a** no doc relevante em `docs/`.

---

## 9. Ambientes

| Ambiente | URL | Branch | Volumes |
|----------|-----|--------|---------|
| Produção | https://patacerta.pt | `main` | `prod_patacerta_*` |
| Stage | https://stage.patacerta.pt | `dev` | `stage_patacerta_*` |

- A API é servida no MESMO domínio via proxy nginx (`/api/*`). **Não existe** subdomínio `api-*`.
- Deploy é automático via Dokploy no push (`main`→prod, `dev`→stage), ~3-5 min.

---

## 10. Checklist antes de entregar qualquer tarefa

- [ ] `pnpm typecheck` passa
- [ ] `pnpm format:check` passa (ou corri `pnpm format`)
- [ ] Não toquei em zonas proibidas (secção 5) sem confirmação
- [ ] Staging de git foi explícito (sem `git add -A`)
- [ ] Mensagens ao utilizador em pt-PT
- [ ] Decisões novas documentadas em `docs/`
