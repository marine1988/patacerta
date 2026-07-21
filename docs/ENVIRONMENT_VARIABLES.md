# Variáveis de Ambiente — Referência Única

> Fonte de verdade consolidada de TODAS as variáveis de ambiente do PataCerta.
> Para valores por ambiente, ver `.env.example` (dev), `.env.stage.example` (stage)
> e `.env.prod.example` (produção). Em produção/stage as variáveis são definidas
> no **Dokploy → Environment**, não em ficheiros.

## Legenda

- **Obrigatória?** — Sim = a app não funciona (ou não arranca) sem ela.
- **Ambiente** — onde é relevante: `dev`, `stage`, `prod`, `todos`.
- **Serviço** — `api` (backend), `web` (frontend build-time), `cron` (jobs de backup).

> ⚠️ Variáveis `VITE_*` são **build-time** (embebidas no bundle do browser via
> build-args do Dockerfile do web). Alterá-las exige **rebuild** do serviço `web`,
> não basta reiniciar.

---

## 1. Núcleo (Core)

| Variável        | Obrigatória?     | Ambiente   | Serviço | Default                 | Descrição                                                                                         |
| --------------- | ---------------- | ---------- | ------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`      | Sim              | todos      | api     | `development`           | `production` ativa fail-safes de segurança                                                        |
| `PORT`          | Não              | todos      | api     | `3001`                  | Porta do servidor Express                                                                         |
| `VOLUME_PREFIX` | Sim (prod/stage) | prod/stage | —       | `stage_patacerta`       | Prefixo dos volumes Docker. **Definir ANTES do 1º deploy** — mudar depois exige migração de dados |
| `FRONTEND_URL`  | Sim              | todos      | api     | `http://localhost:5173` | URL público do site. Também usado como fallback de CORS                                           |
| `CORS_ORIGIN`   | Não              | todos      | api     | `FRONTEND_URL`          | Lista separada por vírgulas de origens permitidas                                                 |
| `PUBLIC_URL`    | Não              | todos      | api     | = FRONTEND_URL          | URL canónico p/ sitemap.xml (sem trailing slash)                                                  |

## 2. Base de Dados

| Variável       | Obrigatória? | Ambiente | Serviço | Default | Descrição                                                                        |
| -------------- | ------------ | -------- | ------- | ------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL` | Sim          | todos    | api     | —       | Connection string PostgreSQL. Em prod inclui `pool_timeout` e `connection_limit` |

## 3. JWT / Autenticação

| Variável                 | Obrigatória? | Ambiente | Serviço | Default | Descrição                                                  |
| ------------------------ | ------------ | -------- | ------- | ------- | ---------------------------------------------------------- |
| `JWT_SECRET`             | Sim          | todos    | api     | —       | Secret dos access tokens. Gerar: `openssl rand -base64 48` |
| `JWT_EXPIRES_IN`         | Não          | todos    | api     | `15m`   | Validade do access token                                   |
| `JWT_REFRESH_SECRET`     | Sim          | todos    | api     | —       | Secret dos refresh tokens (**diferente** do acima)         |
| `JWT_REFRESH_EXPIRES_IN` | Não          | todos    | api     | `7d`    | Validade do refresh token                                  |

## 4. MinIO (Storage S3)

| Variável              | Obrigatória? | Ambiente   | Serviço | Default               | Descrição                                             |
| --------------------- | ------------ | ---------- | ------- | --------------------- | ----------------------------------------------------- |
| `MINIO_ENDPOINT`      | Sim          | todos      | api     | `localhost` / `minio` | Host do MinIO                                         |
| `MINIO_PORT`          | Não          | todos      | api     | `9000`                | Porta                                                 |
| `MINIO_USE_SSL`       | Não          | todos      | api     | `false`               | TLS interno (normalmente false, TLS termina no proxy) |
| `MINIO_ACCESS_KEY`    | Sim          | todos      | api     | —                     | Access key                                            |
| `MINIO_SECRET_KEY`    | Sim          | todos      | api     | —                     | Secret key (password forte em prod)                   |
| `MINIO_ROOT_PASSWORD` | Sim (prod)   | prod/stage | —       | —                     | Password root do serviço MinIO (docker-compose)       |
| `MINIO_BUCKET`        | Não          | todos      | api     | `patacerta-uploads`   | Bucket de uploads (criado automaticamente)            |
| `MINIO_BACKUP_BUCKET` | Não          | prod       | cron    | `patacerta-backups`   | Bucket dos backups                                    |

## 5. Admin (Seed)

| Variável         | Obrigatória? | Ambiente | Serviço | Default              | Descrição                                                                     |
| ---------------- | ------------ | -------- | ------- | -------------------- | ----------------------------------------------------------------------------- |
| `ADMIN_EMAIL`    | Sim (prod)   | todos    | api     | `admin@patacerta.pt` | Email do super-admin criado no seed. **Em prod é obrigatório** (sem fallback) |
| `ADMIN_PASSWORD` | Sim (prod)   | todos    | api     | —                    | Password do super-admin. **Em prod é obrigatório**                            |

## 6. Email (Resend)

| Variável         | Obrigatória? | Ambiente | Serviço | Default                            | Descrição                                                                           |
| ---------------- | ------------ | -------- | ------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Sim (prod)   | todos    | api     | vazio                              | API key do Resend. Sem ela, em prod a API **não arranca** (exceto com escape hatch) |
| `FROM_EMAIL`     | Não          | todos    | api     | `Patacerta <noreply@patacerta.pt>` | Remetente dos emails                                                                |

> Ver `docs/DEPLOYMENT.md` §5 e `docs/ADSENSE_SETUP.md` para setup do domínio (SPF/DKIM/DMARC).

## 7. Stripe (Pagamentos)

| Variável                      | Obrigatória?     | Ambiente | Serviço | Default | Descrição                                                       |
| ----------------------------- | ---------------- | -------- | ------- | ------- | --------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`           | Sim (pagamentos) | todos    | api     | vazio   | `sk_test_` em dev/stage, `sk_live_` em prod. **Nunca expor**    |
| `STRIPE_WEBHOOK_SECRET`       | Sim (pagamentos) | todos    | api     | vazio   | `whsec_` do endpoint webhook. Único por ambiente                |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Sim (pagamentos) | todos    | web     | vazio   | `pk_test_`/`pk_live_`. Exposição no browser é segura por design |

> ⚠️ Ver `docs/stripe-runbook.md` para operação completa. Endpoint webhook: `/api/webhooks/stripe`.

## 8. Geocoding (Nominatim)

| Variável             | Obrigatória? | Ambiente | Serviço | Default                               | Descrição                                                                               |
| -------------------- | ------------ | -------- | ------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `NOMINATIM_BASE_URL` | Não          | todos    | api     | `https://nominatim.openstreetmap.org` | Endpoint de geocoding                                                                   |
| `NOMINATIM_EMAIL`    | Recomendada  | todos    | api     | —                                     | **Exigido pela policy do OSM** (enviado no User-Agent). Usar contacto real por ambiente |

## 9. AdSense (Publicidade)

| Variável                 | Obrigatória? | Ambiente | Serviço | Default | Descrição                                               |
| ------------------------ | ------------ | -------- | ------- | ------- | ------------------------------------------------------- |
| `VITE_ADSENSE_CLIENT_ID` | Não          | prod     | web     | vazio   | Publisher ID `ca-pub-...`. Vazio = slots não renderizam |
| `VITE_ADSENSE_ENABLED`   | Não          | prod     | web     | `false` | Ativa os slots. Só `true` após aprovação Google         |

## 10. Manutenção

| Variável                 | Obrigatória? | Ambiente   | Serviço | Default | Descrição                                                                            |
| ------------------------ | ------------ | ---------- | ------- | ------- | ------------------------------------------------------------------------------------ |
| `MAINTENANCE_MODE`       | Não          | prod/stage | api     | `0`     | `1` = API devolve 503 a tudo exceto `/api/health`. Frontend deteta via `/api/status` |
| `MAINTENANCE_BYPASS_KEY` | Não          | prod/stage | api     | vazio   | Permite bypass admin via header `X-Maintenance-Bypass`                               |

## 11. Backups (produção)

| Variável                        | Obrigatória?  | Ambiente | Serviço | Default | Descrição                                                                             |
| ------------------------------- | ------------- | -------- | ------- | ------- | ------------------------------------------------------------------------------------- |
| `AGE_RECIPIENT`                 | Sim (backups) | prod     | cron    | —       | Chave **pública** age para encriptar. Privada guardada OFFLINE. Ver `docs/RESTORE.md` |
| `HEALTHCHECKS_URL_BACKUP`       | Recomendada   | prod     | cron    | —       | Dead-man-switch backup postgres                                                       |
| `HEALTHCHECKS_URL_BACKUP_MINIO` | Recomendada   | prod     | cron    | —       | Dead-man-switch backup minio                                                          |
| `HEALTHCHECKS_URL_ROTATE`       | Recomendada   | prod     | cron    | —       | Dead-man-switch rotação                                                               |
| `RETENTION_DAILY`               | Não           | prod     | cron    | `7`     | Retenção diária (dias)                                                                |
| `RETENTION_WEEKLY`              | Não           | prod     | cron    | `4`     | Retenção semanal (semanas)                                                            |
| `RETENTION_MONTHLY`             | Não           | prod     | cron    | `6`     | Retenção mensal (meses)                                                               |

## 12. SEO

| Variável        | Obrigatória? | Ambiente | Serviço | Default | Descrição                                                            |
| --------------- | ------------ | -------- | ------- | ------- | -------------------------------------------------------------------- |
| `ROBOTS_HEADER` | Não          | stage    | web     | vazio   | Em stage: `noindex, nofollow` (impede indexação). Em prod: **vazio** |

---

## 13. ⚠️ Flags Perigosas (NUNCA `true` em produção)

Estas flags existem para dev/stage. Em `NODE_ENV=production` a API **recusa arrancar**
se estiverem ativas (a menos que um escape hatch as permita).

| Variável                                      | Default | Perigo se ligada em prod                                            |
| --------------------------------------------- | ------- | ------------------------------------------------------------------- |
| `AUTH_SKIP_EMAIL_VERIFICATION`                | `false` | Contas ativadas sem verificar email                                 |
| `DISABLE_RATE_LIMITS`                         | `false` | Sem proteção contra brute-force/abuso                               |
| `REVIEW_ELIGIBILITY_BYPASS`                   | `0`     | Ignora anti-fraude de avaliações (silenciosamente ignorada em prod) |
| `RESET_DB_ON_BOOT`                            | `false` | **DROPA o schema public — PERDE TODOS OS DADOS**                    |
| `RUN_SEED_ON_BOOT`                            | `false` | Corre seed em cada arranque                                         |
| `RUN_SEED_DEMO_ON_BOOT` / `SEED_INCLUDE_DEMO` | `false` | Insere dados de demonstração                                        |
| `USE_DB_PUSH`                                 | `false` | Usa `db push --accept-data-loss` em vez de migrations               |

### Escape hatches (temporários, para setup inicial)

| Variável                       | Efeito                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `ALLOW_INSECURE_FLAGS_IN_PROD` | Permite `AUTH_SKIP`/`DISABLE_RATE_LIMITS` em prod. **Remover após setup**                    |
| `ALLOW_NO_SMTP_IN_PROD`        | Permite arrancar sem `RESEND_API_KEY` (emails só logados). **Remover após configurar email** |

> Ver `docs/DATABASE_BOOT_STRATEGY.md` para entender `RESET_DB_ON_BOOT` e `USE_DB_PUSH`
> antes de as tocar.
