# PataCerta - Deployment

Deploy via Dokploy (Docker Compose).

## Arquitectura de Deploy

```
                    Internet
                        │
                        ▼
                ┌───────────────┐
                │    Traefik    │  (Dokploy reverse proxy)
                │   :80/:443    │
                └───────┬───────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌───────────────┐ ┌───────────┐ ┌───────────┐
│     web       │ │    api    │ │   cron    │
│   (nginx)     │ │ (express) │ │  (jobs)   │
│    :80        │ │   :3001   │ │           │
└───────────────┘ └─────┬─────┘ └─────┬─────┘
                        │             │
        ┌───────────────┼─────────────┤
        ▼               ▼             ▼
┌───────────────┐ ┌───────────┐ ┌───────────┐
│   postgres    │ │   redis   │ │   minio   │
│    :5432      │ │   :6379   │ │ :9000/9001│
└───────────────┘ └───────────┘ └───────────┘
```

## Variaveis de Ambiente

### Obrigatorias

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `POSTGRES_PASSWORD` | Password PostgreSQL | `<random-64-char>` |
| `JWT_SECRET` | Secret JWT access tokens | `<random-64-char>` |
| `JWT_REFRESH_SECRET` | Secret JWT refresh tokens | `<random-64-char>` |
| `MINIO_ROOT_PASSWORD` | Password MinIO | `<random-32-char>` |
| `ADMIN_EMAIL` | Email do super-admin | `admin@patacerta.pt` |
| `ADMIN_PASSWORD` | Password super-admin | `<strong-password>` |
| `FRONTEND_URL` | URL publica do site | `https://patacerta.pt` |
| `RESEND_API_KEY` | API key Resend (emails) | `re_xxxxx` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_xxxxx` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_xxxxx` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_live_xxxxx` |

### Backups (Recomendado)

| Variavel | Descricao |
|----------|-----------|
| `AGE_RECIPIENT` | Chave publica age para encriptar backups |
| `HEALTHCHECKS_URL_BACKUP` | URL healthchecks.io para postgres |
| `HEALTHCHECKS_URL_BACKUP_MINIO` | URL healthchecks.io para minio |
| `HEALTHCHECKS_URL_ROTATE` | URL healthchecks.io para rotacao |

### Opcionais

| Variavel | Default | Descricao |
|----------|---------|-----------|
| `VOLUME_PREFIX` | `stage_patacerta` | Prefixo dos volumes Docker |
| `CORS_ORIGIN` | `FRONTEND_URL` | Origens CORS permitidas |
| `MAINTENANCE_MODE` | `0` | `1` para activar modo manutencao |
| `ROBOTS_HEADER` | vazio | Header X-Robots-Tag (stage: `noindex`) |

### Flags de Seguranca (NUNCA em producao)

| Variavel | Descricao |
|----------|-----------|
| `AUTH_SKIP_EMAIL_VERIFICATION` | Bypass verificacao email |
| `DISABLE_RATE_LIMITS` | Desactiva rate limiting |
| `RESET_DB_ON_BOOT` | Apaga DB ao iniciar |
| `RUN_SEED_ON_BOOT` | Corre seed ao iniciar |

## Processo de Deploy

### 1. Configurar Dokploy

1. Criar projeto "PataCerta" no Dokploy
2. Adicionar compose file: `docker-compose.dokploy.yml`
3. Configurar variaveis de ambiente (ver acima)
4. Configurar dominio no servico `web`

### 2. Gerar Secrets

```bash
# JWT secrets
openssl rand -base64 48

# Passwords
openssl rand -base64 32

# Age key para backups
age-keygen -o ~/patacerta-backup-key.txt
# Guardar chave privada OFFLINE!
```

### 3. Configurar DNS

```
patacerta.pt       A     <IP_SERVIDOR>
www.patacerta.pt   CNAME patacerta.pt
```

### 4. Configurar Stripe

1. Criar webhook em dashboard.stripe.com
2. Endpoint: `https://patacerta.pt/api/webhooks/stripe`
3. Eventos: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copiar `whsec_...` para `STRIPE_WEBHOOK_SECRET`

### 5. Configurar Email (Resend)

1. Criar conta em resend.com
2. Adicionar dominio `patacerta.pt`
3. Configurar DNS (SPF, DKIM)
4. Criar API key
5. Copiar para `RESEND_API_KEY`

### 6. Deploy

```bash
# Via Dokploy UI: Deploy > Rebuild
# Ou via CLI:
dokploy deploy patacerta
```

## Migracoes

As migracoes correm automaticamente no entrypoint do container `api`:

```bash
# entrypoint.sh
prisma migrate deploy
node dist/index.js
```

Para migracoes manuais:
```bash
# Aceder ao container
docker exec -it patacerta-api sh

# Correr migracao
npx prisma migrate deploy
```

## Backups

O container `cron` corre backups automaticos:

| Job | Schedule | Descricao |
|-----|----------|-----------|
| `backup-postgres.sh` | 02:00 UTC | pg_dump encriptado |
| `backup-minio.sh` | 02:05 UTC | mc mirror uploads |
| `rotate-backups.sh` | 02:30 UTC | Politica GFS |

### Politica de Retencao (GFS)

| Tipo | Retencao |
|------|----------|
| Diarios | 7 dias |
| Semanais | 4 semanas |
| Mensais | 6 meses |

### Restore

Ver `docs/RESTORE.md` para procedimento completo.

```bash
# Exemplo: restore postgres
age -d -i ~/patacerta-backup-key.txt backup.sql.age | \
  psql postgresql://patacerta:$PG_PASS@localhost/patacerta
```

## Modo Manutencao

Para activar manutencao sem downtime:

1. Definir `MAINTENANCE_MODE=1` no Dokploy
2. Reiniciar containers (nao rebuild)
3. API retorna 503 (excepto `/api/health`)
4. Frontend mostra pagina de manutencao

Para bypass (admin):
```bash
curl -H "X-Maintenance-Bypass: $MAINTENANCE_BYPASS_KEY" \
  https://patacerta.pt/api/admin/stats
```

## Monitorizacao

### Health Checks

- API: `GET /api/health` -> `{ "status": "ok" }`
- Healthchecks.io: dead-man-switch para backups
- Dokploy: health checks internos Docker

### Logs

```bash
# Via Dokploy UI: Logs tab

# Via CLI
docker logs patacerta-api -f
docker logs patacerta-cron -f
```

## Rollback

1. No Dokploy, ir a Deployments
2. Seleccionar versao anterior
3. Click "Rollback"

Ou manualmente:
```bash
# Fazer rebuild com commit especifico
git checkout <commit>
dokploy deploy patacerta
```

## Volumes

| Volume | Dados |
|--------|-------|
| `postgres_data` | Base de dados PostgreSQL |
| `minio_data` | Ficheiros uploads |
| `redis_data` | Cache Redis (persistente) |

> **IMPORTANTE:** Definir `VOLUME_PREFIX` ANTES do primeiro deploy. Mudar depois requer migracao manual de dados.
