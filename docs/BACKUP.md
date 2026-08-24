# Plano de Backups — PataCerta

> Estratégia, configuração e verificação de backups. Complementa
> `docs/RESTORE.md` (procedimento de restauro). **Fonte de verdade dos
> scripts:** `apps/api/scripts/` + `apps/api/cron-entrypoint.sh`.

## 1. Resumo (TL;DR)

- **O quê:** PostgreSQL (dump `custom`) + uploads MinIO (tar), **encriptados com `age`**.
- **Onde:** bucket MinIO `patacerta-backups` (mesmo servidor — Fase A).
- **Quando:** diário — Postgres 02:00 UTC, MinIO 02:05 UTC, rotação 02:30 UTC.
- **Retenção (GFS):** 7 diários + 4 semanais + 6 mensais.
- **Monitorização:** Healthchecks.io (dead-man-switch) — alerta se um backup falhar.
- **Chave privada `age`:** **NUNCA no servidor** — guardada OFFLINE pelo operador.

## 2. Arquitetura

```
container cron (busybox crond)
  ├─ 02:00 UTC  backup-postgres.sh   pg_dump -Fc | age -r $AGE_RECIPIENT | mc pipe → bucket
  ├─ 02:05 UTC  backup-minio.sh      tar uploads | age -r $AGE_RECIPIENT | mc pipe → bucket
  └─ 02:30 UTC  rotate-backups.sh    aplica política GFS (apaga excedente)
                                      │
                                      ▼
                       MinIO bucket: patacerta-backups
                         postgres/YYYY/MM/postgres-<ts>.dump.age
                         minio/YYYY/MM/minio-uploads-<ts>.tar.age
```

- **Streaming end-to-end**: sem plaintext em disco (o dump nunca toca o filesystem em claro).
- **Encriptação assimétrica `age`**: a chave **pública** (`AGE_RECIPIENT`) encripta no servidor; só a **privada** (offline) desencripta. Servidor comprometido ≠ backups comprometidos.

## 3. Configuração (uma vez, por ambiente)

### 3.1. Gerar o par de chaves `age` (na TUA máquina, NÃO no servidor)

```bash
# Instalar age:
#   Windows: winget install FiloSottile.age
#   macOS:   brew install age
#   Linux:   apt install age
age-keygen -o patacerta-backup-key.txt
```

O ficheiro contém:

- `# public key: age1xxxx…` → é o **`AGE_RECIPIENT`** (pode ir para o servidor).
- `AGE-SECRET-KEY-1…` → a **chave privada**. **GUARDAR OFFLINE** (2-3 cópias: USB, gestor de passwords). **Se a perderes, os backups ficam ilegíveis para sempre.**

### 3.2. Configurar variáveis no Dokploy (Environment do serviço `api`/compose)

Ver `docs/ENVIRONMENT_VARIABLES.md` §11. Adicionar:

```bash
AGE_RECIPIENT=age1xxxx…              # a chave PÚBLICA do passo 3.1
MINIO_BACKUP_BUCKET=patacerta-backups   # (default; opcional)

# Healthchecks.io (criar 3 checks em https://healthchecks.io — free tier 20 checks)
HEALTHCHECKS_URL_BACKUP=https://hc-ping.com/<uuid-postgres>
HEALTHCHECKS_URL_BACKUP_MINIO=https://hc-ping.com/<uuid-minio>
HEALTHCHECKS_URL_ROTATE=https://hc-ping.com/<uuid-rotate>

# Retenção (opcional — defaults sensatos)
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=6
```

> Sem `AGE_RECIPIENT`, os scripts de backup **falham propositadamente** com
> mensagem clara (não corrompem nada). Os restantes jobs (expire-slots,
> cleanup-tokens) continuam a correr.

### 3.3. Healthchecks.io — setup de cada check

Para cada um dos 3 checks:

- **Period:** 1 day
- **Grace:** 2 hours (o backup MinIO pode demorar conforme o volume)
- **Notifications:** email / Slack / Discord
- Copiar o URL `https://hc-ping.com/<uuid>` para a env var respetiva.

Os scripts fazem ping `/start` no início, ``no sucesso e`/fail` em erro —
o Healthchecks alerta se um backup **não** correr ou falhar.

## 4. Verificação (após configurar)

O primeiro backup automático corre às **02:00 UTC**. Para não esperar, força
manualmente no host (SSH ou terminal Dokploy do container cron):

```bash
# Forçar backup postgres agora
docker exec -it <cron-container> /app/scripts/backup-postgres.sh
# Forçar backup minio
docker exec -it <cron-container> /app/scripts/backup-minio.sh
# Ver o que a rotação apagaria (sem apagar)
docker exec -e DRY_RUN=1 -it <cron-container> /app/scripts/rotate-backups.sh

# Listar backups no bucket
docker exec -it <cron-container> sh -c \
  'mc alias set l http://$MINIO_ENDPOINT:$MINIO_PORT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY >/dev/null && \
   mc ls --recursive l/patacerta-backups/'
```

Saída esperada do backup-postgres: `[backup-pg] … sucesso (X.XX MiB) → postgres/…`.

## 5. Restauro

Procedimento completo em **`docs/RESTORE.md`**. Resumo:

```bash
# Descarregar + desencriptar + restaurar
mc cp l/patacerta-backups/postgres/….dump.age ./restore.dump.age
age -d -i patacerta-backup-key.txt -o restore.dump restore.dump.age
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" restore.dump
```

## 6. Restore drill (OBRIGATÓRIO — trimestral)

> **Backups não testados não são backups.** Calendarizar todos os trimestres.

1. `docker run -d --name pgtest -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine`
2. Restaurar o último dump para essa BD descartável (ver `docs/RESTORE.md` §4).
3. Validar: contar `users`, `breeds`, `sponsored_slots`; verificar relações/datas.
4. Registar data + resultado em `docs/restore-drills.log` (criar no 1º drill).

## 7. Retenção (GFS) — o que fica guardado

| Tier    | Quantidade | Cobertura       |
| ------- | ---------- | --------------- |
| Diário  | 7          | última semana   |
| Semanal | 4          | último mês      |
| Mensal  | 6          | último semestre |

Total ≈ 17 backups por categoria (postgres + minio). A rotação (`rotate-backups.sh`)
é **idempotente** — correr 2× seguidas não apaga nada a mais.

## 8. Checklist de prontidão de backups

- [ ] `age-keygen` corrido; chave privada guardada OFFLINE (2-3 cópias)
- [ ] `AGE_RECIPIENT` (pública) definido no Dokploy (prod **e** stage)
- [ ] 3 checks criados em Healthchecks.io + URLs nas env vars
- [ ] Backup manual forçado com sucesso (postgres + minio)
- [ ] `mc ls` mostra os `.age` no bucket `patacerta-backups`
- [ ] 1º restore drill feito e registado
- [ ] (Fase B) push offsite configurado (ver `docs/RESTORE.md` §9)

## 9. Fase B — offsite (roadmap)

Fase A guarda backups **no mesmo servidor** → se o servidor morrer, os backups
morrem com ele. Mitigação futura em `docs/RESTORE.md` §9 (push para MinIO/rclone
num Unraid via Cloudflare Tunnel). **Prioridade alta pós-lançamento.**
