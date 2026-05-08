# Disaster Recovery — Restore Runbook

> **TL;DR**: backups diários encriptados com `age`, guardados no MinIO bucket `patacerta-backups`, retidos via GFS (7d + 4w + 6m). Restore = descarregar `.age` → `age -d` → `pg_restore` ou `tar -x`. **Precisas da chave privada `age` que está OFFLINE — sem ela os backups são inúteis.**

---

## 1. Visão geral

| O quê                            | Job                  | Frequência       | Localização                                                                    |
| -------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------------------ |
| Postgres dump (formato `custom`) | `backup-postgres.sh` | Diário 02:00 UTC | `s3://patacerta-backups/postgres/YYYY/MM/postgres-YYYY-MM-DD_HHMMSS.dump.age`  |
| MinIO uploads (tar)              | `backup-minio.sh`    | Diário 02:05 UTC | `s3://patacerta-backups/minio/YYYY/MM/minio-uploads-YYYY-MM-DD_HHMMSS.tar.age` |
| Rotação GFS                      | `rotate-backups.sh`  | Diário 02:30 UTC | aplica retenção 7d+4w+6m                                                       |

**Encriptação**: `age` com chave assimétrica.

- **Chave pública (`AGE_RECIPIENT`)**: vive em env var no servidor. SÓ encripta.
- **Chave privada (`AGE_IDENTITY`)**: NUNCA está no servidor. Guardada offline (USB / 1Password / gestor de passwords).

**Resultado**: se o servidor for comprometido, o atacante NÃO consegue ler os backups antigos.

---

## 2. Pré-requisitos para restore

Na tua máquina local (não no servidor):

1. **Chave privada `age`** em ficheiro acessível, ex: `~/patacerta-backup-key.txt`.
   Conteúdo deve incluir uma linha `AGE-SECRET-KEY-1...`.
2. **`age`** instalado:
   - Windows: `winget install FiloSottile.age`
   - macOS: `brew install age`
   - Linux: `apt install age` ou equivalente
3. **`mc`** (MinIO client):
   - `winget install MinIO.Client` ou `brew install minio/stable/mc`
4. **`pg_restore`** versão >= 16 (vem com cliente Postgres).
5. **Acesso ao MinIO de produção** — precisa do `MINIO_ROOT_PASSWORD` que está no painel Dokploy.

---

## 3. Listar backups disponíveis

```sh
# Setup mc alias para o MinIO de produção (uma vez)
# Substituir <password> pelo MINIO_ROOT_PASSWORD do Dokploy.
# Acesso: precisa do MinIO console exposto OU túnel SSH para porta 9000.
mc alias set patacerta-prod https://minio.patacerta.pt patacerta <password>

# Listar todos os backups
mc ls --recursive patacerta-prod/patacerta-backups/

# Apenas Postgres mais recentes
mc ls --recursive patacerta-prod/patacerta-backups/postgres/ | sort -k1 | tail -10

# Apenas MinIO uploads mais recentes
mc ls --recursive patacerta-prod/patacerta-backups/minio/ | sort -k1 | tail -10
```

---

## 4. Restore Postgres

### 4.1. Descarregar e desencriptar

```sh
# Escolher o backup pretendido (último por defeito)
LATEST=$(mc ls --recursive patacerta-prod/patacerta-backups/postgres/ \
  | sort -k1 | tail -1 | awk '{print $NF}')

# Descarregar
mc cp "patacerta-prod/patacerta-backups/${LATEST}" ./postgres-restore.dump.age

# Desencriptar (vai pedir/usar chave privada)
age -d -i ~/patacerta-backup-key.txt -o postgres-restore.dump postgres-restore.dump.age

# Verificar tamanho — deve ser >>0 e parecido ao original
ls -lh postgres-restore.dump
```

### 4.2. Restaurar para BD (drop+recreate)

⚠️ **Destrutivo**. Usar contra BD que pode ser reescrita (stage / nova prod / restore drill).

```sh
# Conexão à BD alvo. Para prod, usar o DATABASE_URL do Dokploy.
# Para restore drill local, usar uma BD descartável.
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# 1. Drop e recriar a BD (precisa de permissões superuser ou owner)
psql "$DATABASE_URL" -c "SELECT 1" >/dev/null  # testar conexão
# Cuidado: ajustar nome da BD conforme connection string
# Se quiseres restaurar para BD DIFERENTE da do connection string, ajusta.

# 2. pg_restore (BD vazia)
pg_restore \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --dbname="$DATABASE_URL" \
  --jobs=4 \
  --verbose \
  postgres-restore.dump

# 3. Verificar
psql "$DATABASE_URL" -c "\dt" | head -20
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"User\";"
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"Breed\";"
```

### 4.3. Restore parcial (uma tabela)

```sh
# Listar conteúdo do dump sem restaurar
pg_restore --list postgres-restore.dump | grep -i breeder

# Extrair apenas TABLE entries específicas para um TOC file
pg_restore --list postgres-restore.dump > /tmp/toc.txt
# Editar /tmp/toc.txt: comentar linhas a NÃO restaurar com ";"

# Restaurar apenas o que sobrou
pg_restore --use-list=/tmp/toc.txt --dbname="$DATABASE_URL" postgres-restore.dump
```

---

## 5. Restore MinIO uploads

### 5.1. Descarregar e desencriptar

```sh
LATEST=$(mc ls --recursive patacerta-prod/patacerta-backups/minio/ \
  | sort -k1 | tail -1 | awk '{print $NF}')

mc cp "patacerta-prod/patacerta-backups/${LATEST}" ./minio-restore.tar.age
age -d -i ~/patacerta-backup-key.txt -o minio-restore.tar minio-restore.tar.age

# Inspeccionar conteúdo (deve ter pasta uploads/ na raiz)
tar -tf minio-restore.tar | head -20
```

### 5.2. Restaurar para o MinIO

⚠️ **Destrutivo**. `mc mirror --remove` apaga ficheiros que não existam no source.

```sh
# Extrair localmente
mkdir -p /tmp/minio-restore
tar -xf minio-restore.tar -C /tmp/minio-restore
# Estrutura: /tmp/minio-restore/uploads/<keys do bucket>

# Opção A: SUBSTITUIR bucket completo (apaga ficheiros novos)
mc mirror --overwrite --remove /tmp/minio-restore/uploads patacerta-prod/patacerta-uploads

# Opção B: MERGE (não apaga, só adiciona/substitui)
mc mirror --overwrite /tmp/minio-restore/uploads patacerta-prod/patacerta-uploads

# Verificar
mc ls --recursive patacerta-prod/patacerta-uploads | wc -l
```

---

## 6. Restore drill (OBRIGATÓRIO trimestralmente)

**Backups não testados não são backups**. Calendarizar todos os trimestres:

1. Criar BD descartável local (`docker run -d --name pgtest -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine`).
2. Seguir secção 4.2 contra `postgresql://postgres:test@localhost:55432/postgres`.
3. Validar: contar utilizadores, raças, sponsored slots; verificar que datas/relações fazem sentido.
4. Para MinIO: extrair tar para `/tmp` e contar ficheiros vs `mc ls` do bucket prod.
5. Documentar data + sucesso/falha em `docs/restore-drills.log` (criar quando fizeres o primeiro).

---

## 7. Cenários de DR

### 7.1. Servidor Hetzner morre completamente

1. Provisionar novo servidor Dokploy.
2. Restaurar `docker-compose.dokploy.yml` + env vars.
3. Acesso à chave privada `age` offline.
4. **Acesso aos backups**: se eram só locais (Fase A), os backups morreram com o servidor → **perda total**.
   - Por isso a Fase B (push offsite Unraid) é crítica.
5. Com offsite: descarregar do Unraid → seguir secções 4 e 5.

### 7.2. BD corrompida mas servidor OK

1. Parar serviços que escrevem (`docker compose stop api cron`).
2. Backup do estado actual antes de tocar (paranoia: `pg_dump` manual).
3. Seguir secção 4 contra a BD prod.
4. Reiniciar (`docker compose up -d`).

### 7.3. Ficheiros MinIO apagados/corrompidos

1. Identificar timestamp da corrupção.
2. Escolher backup ANTERIOR a esse timestamp.
3. Seguir secção 5.2 com Opção B (merge) para não perder uploads novos.

### 7.4. Chave `age` privada perdida

**Backups encriptados ficam permanentemente ilegíveis.** Não há recuperação.

- Mitigação: 2-3 cópias da chave em locais físicos diferentes (USB no escritório, USB em casa, vault online).

---

## 8. Manutenção / troubleshooting

### Ver logs de backup

```sh
docker logs --tail 200 patacerta-monorepo-<id>-cron-1 | grep -E '\[backup-|\[rotate'
```

### Forçar backup manual (sem esperar pelo cron)

```sh
docker exec -it patacerta-monorepo-<id>-cron-1 /app/scripts/backup-postgres.sh
docker exec -it patacerta-monorepo-<id>-cron-1 /app/scripts/backup-minio.sh
```

### Dry-run da rotação (vê o que seria apagado sem apagar)

```sh
docker exec -e DRY_RUN=1 -it patacerta-monorepo-<id>-cron-1 /app/scripts/rotate-backups.sh
```

### Healthchecks.io diz "down" mas backup correu OK

- Verificar `HEALTHCHECKS_URL_*` está definido na env do `cron` service.
- Verificar que o container tem rede para fora (`docker exec cron wget -qO- https://hc-ping.com`).
- Verificar grace period no painel healthchecks.io (default 1h pode ser apertado se o backup demorar).

---

## 9. TODO Fase B — push offsite Unraid

Quando o Unraid + Cloudflare Tunnel estiverem prontos:

1. Instalar MinIO (ou rclone server) no Unraid.
2. Cloudflare Tunnel: expor porta 9000 do MinIO Unraid via `minio-unraid.tunel.example`.
3. Adicionar env vars no `cron` service:
   - `OFFSITE_ENDPOINT`, `OFFSITE_ACCESS_KEY`, `OFFSITE_SECRET_KEY`, `OFFSITE_BUCKET`
4. Criar `apps/api/scripts/push-offsite.sh`:
   ```sh
   mc alias set offsite "https://${OFFSITE_ENDPOINT}" ...
   mc mirror --overwrite local/patacerta-backups offsite/${OFFSITE_BUCKET}
   ```
5. Adicionar entry no `cron-entrypoint.sh`:
   ```
   0 4 * * * . /app/.cron.env && /app/scripts/push-offsite.sh > /proc/1/fd/1 2>&1
   ```
6. Healthchecks.io: 4º check `patacerta-backup-offsite`.
