# Disaster Recovery — Restore Runbook

> **TL;DR**: backups diários encriptados com `age`, guardados em **duas** cópias — bucket MinIO `patacerta-backups` (no servidor) e o mirror offsite em Cloudflare R2 `patacerta-backups-offsite` — retidos via GFS (7d + 4w + 6m) no local. Restore = descarregar `.age` → `age -d` → `pg_restore` ou `tar -x`. **Precisas da chave privada `age` que está OFFLINE — sem ela os backups são inúteis.**
>
> **Não existe `minio.patacerta.pt`.** O MinIO não publica portas no host (por desenho): o único acesso local é de dentro do contentor `cron` (secção 3.2). Para DR real (servidor perdido) a fonte é o **offsite** (secção 3.1).

---

## 1. Visão geral

| O quê                            | Job                  | Frequência       | Localização                                                                    |
| -------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------------------ |
| Postgres dump (formato `custom`) | `backup-postgres.sh` | Diário 02:00 UTC | `s3://patacerta-backups/postgres/YYYY/MM/postgres-YYYY-MM-DD_HHMMSS.dump.age`  |
| MinIO uploads (tar)              | `backup-minio.sh`    | Diário 02:05 UTC | `s3://patacerta-backups/minio/YYYY/MM/minio-uploads-YYYY-MM-DD_HHMMSS.tar.age` |
| Rotação GFS                      | `rotate-backups.sh`  | Diário 02:30 UTC | aplica retenção 7d+4w+6m (só no bucket local)                                  |
| **Mirror offsite**               | `push-offsite.sh`    | Diário 02:45 UTC | `s3://patacerta-backups-offsite/…` (Cloudflare R2) — mesmos nomes de objecto   |

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
5. **Acesso aos backups** — um dos dois caminhos reais da secção 3:
   - **offsite (recomendado)**: endpoint S3 do Cloudflare R2 + `OFFSITE_ACCESS_KEY`/`OFFSITE_SECRET_KEY`
     (definidos no env do `cron` no Dokploy). É o único caminho que sobrevive à perda do servidor.
     Se o token do R2 for só-escrita, gera um token de leitura no painel do R2 para o restauro.
   - **local (servidor vivo)**: `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` + `docker exec` no contentor `cron`.
     MinIO **não** está publicado no host — não há URL pública.

---

## 3. Listar backups disponíveis

Há **duas** cópias e **nenhuma** está exposta à internet:

| Cópia       | Onde                                              | Como se acede                                                                          |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Local**   | MinIO `minio:9000`, bucket `patacerta-backups`    | rede interna do compose — só de dentro do contentor `cron` (que tem `mc` + o env)      |
| **Offsite** | Cloudflare R2, bucket `patacerta-backups-offsite` | endpoint S3 do R2 + credenciais `OFFSITE_*` (mirror diário às 02:45 UTC, blobs `.age`) |

`minio.patacerta.pt` **não existe** — não há DNS, túnel nem porta publicada (decisão de
segurança: o object storage nunca é exposto). Usa um dos caminhos abaixo.

### 3.1. Offsite (R2) — a partir da tua máquina

```sh
# Endpoint S3 do R2 (painel Cloudflare > R2 > Manage API Tokens mostra o account id).
mc alias set offsite "https://<account-id>.r2.cloudflarestorage.com" \
  "$OFFSITE_ACCESS_KEY" "$OFFSITE_SECRET_KEY"

# Postgres mais recentes
mc ls --recursive offsite/patacerta-backups-offsite/postgres/ | awk '{print $NF}' | sort | tail -10

# Uploads MinIO mais recentes
mc ls --recursive offsite/patacerta-backups-offsite/minio/ | awk '{print $NF}' | sort | tail -10
```

> O token `OFFSITE_*` do `cron` pode ser só-escrita (é o que basta ao mirror). Para restauro
> gera no painel do R2 um token com **Object Read** e usa-o no `mc alias set`.

### 3.2. Local (MinIO do servidor) — a partir do contentor `cron`

O MinIO só existe na rede interna do compose. O contentor `cron` já tem `mc`, `MINIO_*` e
`MINIO_BACKUP_BUCKET` no ambiente, por isso é o ponto de entrada:

```sh
CRON=$(docker ps --format '{{.Names}}' | grep cron | head -1)

docker exec -it "$CRON" sh -c '
  mc alias set l "http://$MINIO_ENDPOINT:$MINIO_PORT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
  mc ls --recursive l/patacerta-backups/postgres/ | awk "{print \$NF}" | sort | tail -10
'
```

Para trazer um objecto para a tua máquina, copia primeiro para `/tmp` do contentor e depois
`docker cp` (o `mc cp` não escreve no teu disco):

```sh
docker exec "$CRON" sh -c '
  mc alias set l "http://$MINIO_ENDPOINT:$MINIO_PORT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
  mc cp "l/patacerta-backups/postgres/2026/11/postgres-2026-11-24_020009.dump.age" /tmp/restore.dump.age'
docker cp "$CRON":/tmp/restore.dump.age ./postgres-restore.dump.age
```

---

## 4. Restore Postgres

### 4.1. Descarregar e desencriptar

```sh
# Fonte: offsite (sobrevive à perda do servidor) ou local (servidor vivo, secção 3.2).
SRC="offsite/patacerta-backups-offsite"
# SRC="l/patacerta-backups"     # dentro do contentor cron

# Escolher o backup pretendido (último por defeito)
LATEST=$(mc ls --recursive "$SRC/postgres/" | awk '{print $NF}' | sort | tail -1)

# Descarregar (o $LATEST já inclui o prefixo postgres/, não o repetir)
mc cp "$SRC/${LATEST}" ./postgres-restore.dump.age

# Desencriptar (vai pedir/usar chave privada)
age -d -i ~/patacerta-backup-key.txt -o postgres-restore.dump postgres-restore.dump.age

# Verificar tamanho — um dump saudável desta app tem ~150 KB desencriptado;
# um .age de poucas centenas de bytes é header de um dump falhado (ver docs/BACKUP.md §9).
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
SRC="offsite/patacerta-backups-offsite"
# SRC="l/patacerta-backups"     # dentro do contentor cron

LATEST=$(mc ls --recursive "$SRC/minio/" | awk '{print $NF}' | sort | tail -1)

mc cp "$SRC/${LATEST}" ./minio-restore.tar.age
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

# O destino é o MinIO do servidor, que não está publicado: o mirror tem de correr
# de dentro do contentor `cron` (env MINIO_* já lá está) com o tar copiado para lá.
docker cp /tmp/minio-restore "$CRON":/tmp/minio-restore
docker exec -it "$CRON" sh -c '
  mc alias set l "http://$MINIO_ENDPOINT:$MINIO_PORT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
  # Opção A: SUBSTITUIR bucket completo (apaga ficheiros novos)
  mc mirror --overwrite --remove /tmp/minio-restore/uploads l/patacerta-uploads
  # Opção B: MERGE (não apaga, só adiciona/substitui)
  # mc mirror --overwrite /tmp/minio-restore/uploads l/patacerta-uploads
  mc ls --recursive l/patacerta-uploads | wc -l
'
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
4. **Acesso aos backups**: o bucket local e o MinIO morreram com o servidor → restaurar do
   **offsite** (Cloudflare R2, `patacerta-backups-offsite`, secção 3.1). O offsite é o que impede
   que a perda do servidor seja perda total de dados; o mirror diário às 02:45 UTC dá um RPO
   de ~1 dia (24 h no pior caso: dump das 02:00 e mirror às 02:45).
5. Descarregar do offsite → seguir secções 4 e 5.

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

## 9. Offsite (implementado — Cloudflare R2)

O offsite **já está a correr em produção**; não é roadmap e não é "TODO Fase B".

| Item              | Valor                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Provider / bucket | Cloudflare R2 · `patacerta-backups-offsite`                                                                            |
| Script            | `apps/api/scripts/push-offsite.sh` (`mc mirror --overwrite`, só blobs `.age`)                                          |
| Agendamento       | diário **02:45 UTC** (`apps/api/cron-entrypoint.sh`), 15 min depois da rotação                                         |
| Origem → destino  | bucket local `patacerta-backups` (MinIO) → R2                                                                          |
| Env vars          | `OFFSITE_ENDPOINT`, `OFFSITE_ACCESS_KEY`, `OFFSITE_SECRET_KEY`, `OFFSITE_BUCKET` (default), `HEALTHCHECKS_URL_OFFSITE` |
| Volumetria medida | 187 objectos / 56,15 MiB em 92 dias (~0,6 MiB/dia)                                                                     |

Sem `OFFSITE_*` definido o script sai com **0** e escreve `a saltar (sem copia offsite)` no log —
é o que faz o stage não falhar. Em produção as vars estão definidas: os objectos chegam ao R2
todos os dias.

### 9.1. Limitações conhecidas (dívida, não bugs)

1. **Sem retenção no offsite.** `mc mirror --overwrite` não usa `--remove`: o bucket só cresce
   (~220 MiB/ano). Não há urgência de espaço — falta política (lifecycle rule no R2, ou
   `--remove` mensal alinhado com o GFS local).
2. **Sem versioning nem object-lock.** O token do R2 tem escrita e vive no env do `cron`; um RCE
   no contentor apaga a produção **e** a cópia offsite.
3. **Credencial única de escrita** no env do `cron`. O desenho correto é token só-escrita para o
   `cron` + token só-leitura para restauros.
4. **Dead-man-switch parcial** — `HEALTHCHECKS_URL_OFFSITE` não estava definido (ver
   `AUDIT-OPS.md` OPS-04); sem ele uma falha do mirror é silenciosa.

### 9.2. Incidente histórico: o objecto de 200 B

`postgres/2026/08/postgres-2026-08-25_135207.dump.age` tem **200 bytes** — header `age` de um dump
que morreu a meio da pipeline (primeira execução manual). O guard antigo (`SIZE -lt 100`) deixou-o
passar, foi mirrorizado para o offsite e o healthchecks pingou sucesso. O objecto **mantém-se**
como evidência; o limite passou a 4096 B em `apps/api/scripts/backup-postgres.sh`, com teste
próprio (`apps/api/src/lib/backup-postgres-size-guard.test.ts`). Detalhe em `docs/BACKUP.md §9`.
