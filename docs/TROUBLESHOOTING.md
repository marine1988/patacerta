# Troubleshooting — Guia Central de Diagnóstico

> Índice de sintomas → causa → solução. Consulta isto ANTES de fazer alterações
> ao código quando algo falha. Cada entrada aponta para o ficheiro/doc relevante.

## Como ler logs

- **Produção/Stage (Dokploy):** UI → serviço → Logs, ou `docker logs <container> -f`
- **Dev local:** os `pnpm dev` mostram logs no terminal; DB via `pnpm db:studio`

---

## 1. Setup / Arranque local

### "Cannot connect to database" / ECONNREFUSED :5432

- **Causa:** Postgres não está a correr.
- **Fix:**
  ```bash
  docker ps | Select-String postgres   # verificar
  pnpm docker:down; pnpm docker:up      # reiniciar infra
  ```

### "Port 5173 already in use" (ou 3001)

- **Causa:** processo anterior ainda a ocupar a porta.
- **Fix (Windows):** `netstat -ano | findstr :5173` → `taskkill /PID <pid> /F`

### "Prisma client out of sync" / tipos desatualizados

- **Fix:** `pnpm --filter @patacerta/api db:generate`

### `@patacerta/shared` não encontrado / tipos partilhados falham

- **Causa:** o package `shared` não foi buildado.
- **Fix:** `pnpm --filter @patacerta/shared build`

---

## 2. Base de Dados

### "relation X does not exist" mas migrate diz "No pending migrations"

- **Ver:** `docs/DATABASE_BOOT_STRATEGY.md` → secção "Incidente conhecido".
- **Fix rápido (container api, `/app/apps/api`):**
  ```bash
  npx prisma migrate resolve --rolled-back 00001_init
  npx prisma migrate deploy
  # se persistir:
  npx prisma db push
  npx tsx prisma/seed.ts
  ```

### `npx prisma db seed` falha ("prisma.seed property missing")

- **Causa:** o seed não está registado no formato Prisma.
- **Fix:** usar `npx tsx prisma/seed.ts` diretamente (nunca `prisma db seed`).

### migrate deploy falha com **P3009**

- O `entrypoint.sh` tenta auto-recovery. Se falhar manualmente, ver
  `docs/DATABASE_BOOT_STRATEGY.md` → "Auto-recovery de P3009".

---

## 3. Autenticação / API

### 401 "INVALID_TOKEN" em pedidos autenticados

- **Causas prováveis:** access token expirado (15min) — o frontend deve renovar via
  `/api/auth/refresh`; ou `JWT_SECRET` diferente entre deploys.
- **Verificar:** `JWT_SECRET` e `JWT_REFRESH_SECRET` estão definidos e estáveis.

### Registo/login não envia email de verificação

- **Causa:** `RESEND_API_KEY` em falta.
- **Fix:** definir `RESEND_API_KEY` no Dokploy. Ver `apps/api/src/lib/email.ts`.
- **Nota:** com `ALLOW_NO_SMTP_IN_PROD=1`, emails são só logados (não enviados).

### API recusa arrancar em produção (exit 1)

- **Causas (fail-safes):** `RESEND_API_KEY` ausente, ou flags inseguras ativas
  (`AUTH_SKIP_EMAIL_VERIFICATION=true` / `DISABLE_RATE_LIMITS=true`) sem escape hatch.
- **Ver:** `apps/api/src/index.ts` (bloco de validação de produção) e
  `docs/ENVIRONMENT_VARIABLES.md` §13.

---

## 4. CORS

### "blocked by CORS policy" no browser

- **Causa:** origem do frontend não está na allowlist.
- **Fix:** definir `CORS_ORIGIN` (ou `FRONTEND_URL`) com o domínio exato, sem trailing slash.
- **Ver:** `apps/api/src/index.ts` (config de CORS). `*` com credentials é rejeitado por design.

---

## 5. Modo de Manutenção

### Site oscila entre página de manutenção e site normal ao fazer refresh

- **Causa:** o frontend detetava manutenção via `/api/health` (que tem bypass e devolve
  sempre 200). **Já corrigido** — usa `/api/status`.
- **Verificar:** `apps/web/src/contexts/MaintenanceContext.tsx` chama `/status`, não `/health`.

### Preciso de aceder ao site durante manutenção (admin)

- **Fix:** header `X-Maintenance-Bypass: <MAINTENANCE_BYPASS_KEY>`.
  ```bash
  curl -H "X-Maintenance-Bypass: <key>" https://patacerta.pt/api/...
  ```

### `/api/health` funciona mas o resto devolve 503

- **Normal** em manutenção. `/api/health` tem bypass (para healthchecks Docker);
  `/api/status` e todas as outras rotas devolvem 503.

---

## 6. Pagamentos (Stripe)

### Webhook devolve 400 "assinatura inválida"

- **Causa:** `STRIPE_WEBHOOK_SECRET` no Dokploy ≠ secret do endpoint na Stripe.
- **Ver:** `docs/stripe-runbook.md` §7.1.

### Webhook devolve 503 "Webhook não configurado"

- **Causa:** `STRIPE_WEBHOOK_SECRET` em falta.

### Checkout devolve 500 "STRIPE_NOT_CONFIGURED"

- **Causa:** `STRIPE_SECRET_KEY` em falta.

> ⚠️ **Nunca** reordenar o middleware do webhook em `apps/api/src/index.ts`: o
> `express.raw()` do webhook TEM de vir ANTES do `express.json()`, senão a
> validação de assinatura quebra silenciosamente.

---

## 7. Uploads / MinIO

### "MinIO bucket not found" / uploads falham

- **Causa:** bucket não provisionado (normalmente criado no arranque da API).
- **Fix dev:** abrir console MinIO (http://localhost:9001) e criar `patacerta-uploads`.
- **Verificar:** credenciais `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`.

---

## 8. Emails não chegam (mas API arranca)

- `RESEND_API_KEY` presente mas domínio não verificado no Resend (DNS SPF/DKIM/DMARC).
- Ver `docs/DEPLOYMENT.md` §5 e o dashboard do Resend.

---

## 9. Backups

### Healthchecks.io diz "down" mas backup correu

- **Ver:** `docs/RESTORE.md` §8 (verificar `HEALTHCHECKS_URL_*` e rede do container cron).

### Forçar backup manual

```bash
docker exec -it <cron-container> /app/scripts/backup-postgres.sh
docker exec -it <cron-container> /app/scripts/backup-minio.sh
```

### Restaurar um backup

- **Ver:** `docs/RESTORE.md` (procedimento completo, precisa da chave `age` privada OFFLINE).

---

## 10. CI / Validação

### CI falha em "Lint & Typecheck"

- **Nota:** não há ESLint. O passo corre `pnpm typecheck` + `pnpm format:check`.
- **Fix formatação:** `pnpm format` (aplica Prettier) e commita.
- **Fix tipos:** corrigir os erros de `tsc --noEmit` reportados.

### "meu código passa local mas CI falha"

- Confirmar que buildaste `shared`: `pnpm --filter @patacerta/shared build`.
- Confirmar versão de pnpm (9.12.0 fixada) — CI usa `--frozen-lockfile`.

---

## Quando nada disto resolve

1. Reproduz localmente com `pnpm dev` e logs verbosos.
2. Confirma variáveis de ambiente contra `docs/ENVIRONMENT_VARIABLES.md`.
3. Se envolver migrations destrutivas, secrets ou pagamentos → **PÁRA e pergunta ao utilizador**.
4. Documenta a causa e o fix aqui (adiciona uma entrada nova) para o próximo agente.
