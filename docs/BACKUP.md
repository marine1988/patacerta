# Plano de Backups — PataCerta

> Estratégia, configuração e verificação de backups. Complementa
> `docs/RESTORE.md` (procedimento de restauro). **Fonte de verdade dos
> scripts:** `apps/api/scripts/` + `apps/api/cron-entrypoint.sh`.

## 1. Resumo (TL;DR)

- **O quê:** PostgreSQL (dump `custom`) + uploads MinIO (tar), **encriptados com `age`**.
- **Onde:** **duas** cópias — bucket MinIO `patacerta-backups` (no servidor) **e** mirror offsite em
  Cloudflare R2 `patacerta-backups-offsite` (diário, 02:45 UTC).
- **Quando:** diário — Postgres 02:00 UTC, MinIO 02:05 UTC, rotação 02:30 UTC, push offsite 02:45 UTC.
- **Retenção (GFS):** 7 diários + 4 semanais + 6 mensais — **só no bucket local** (o offsite acumula).
- **Monitorização:** Healthchecks.io (dead-man-switch) — alerta se um backup falhar.
- **Chave privada `age`:** **NUNCA no servidor** — guardada OFFLINE pelo operador.

## 2. Arquitetura

```
container cron (busybox crond)
  ├─ 02:00 UTC  backup-postgres.sh   pg_dump -Fc | age -r $AGE_RECIPIENT | mc pipe → bucket
  ├─ 02:05 UTC  backup-minio.sh      tar uploads | age -r $AGE_RECIPIENT | mc pipe → bucket
  ├─ 02:30 UTC  rotate-backups.sh    aplica política GFS (apaga excedente)
  └─ 02:45 UTC  push-offsite.sh      mc mirror (só .age) → Cloudflare R2
                                      │
                                      ▼
                       MinIO bucket: patacerta-backups        (mesmo host)
                         postgres/YYYY/MM/postgres-<ts>.dump.age
                         minio/YYYY/MM/minio-uploads-<ts>.tar.age
                                      │
                                      ▼ mc mirror --overwrite
                       R2 bucket: patacerta-backups-offsite    (offsite)
                         mesmos caminhos, mesmo nomes
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
# 4º check recomendado: o mirror offsite é a única cópia que sobrevive à perda do servidor
HEALTHCHECKS_URL_OFFSITE=https://hc-ping.com/<uuid-offsite>

# Offsite (Cloudflare R2) — sem estas vars o push-offsite.sh salta (exit 0)
OFFSITE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
OFFSITE_ACCESS_KEY=<token com write no bucket>
OFFSITE_SECRET_KEY=<secret do token>
OFFSITE_BUCKET=patacerta-backups-offsite

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

Saída esperada do backup-postgres: `[backup-pg] … sucesso (153568 bytes / 0.15 MiB, minimo 4096) → postgres/…`.

O tamanho **tem de** aparecer: o script recusa objectos abaixo de 4096 B (exit 5, sem ping de
sucesso) porque um `.age` de poucas centenas de bytes é header de um dump falhado — ver §9.

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
- [ ] 3 checks criados em Healthchecks.io + URLs nas env vars (+ `HEALTHCHECKS_URL_OFFSITE`)
- [ ] `OFFSITE_*` definido no Dokploy e `mc ls` do R2 mostra os objectos `.age` do dia
- [ ] Backup manual forçado com sucesso (postgres + minio)
- [ ] `mc ls` mostra os `.age` no bucket `patacerta-backups`
- [ ] 1º restore drill feito e registado

## 9. Offsite em produção (Cloudflare R2) — implementado

O offsite **existe e está activo**: `push-offsite.sh` corre às 02:45 UTC e espelha o bucket local
para o R2. Não é roadmap.

| Item              | Valor                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| Bucket            | `patacerta-backups-offsite` (Cloudflare R2)                              |
| Conteúdo          | só blobs `.age` (já encriptados) — o provider nunca vê plaintext         |
| Comando           | `mc mirror --overwrite` (incremental, **sem** `--remove`)                |
| Volumetria medida | 187 objectos / 56,15 MiB em 92 dias (2026-08-25 → 2026-11-24)            |
| Retenção          | **nenhuma** — o offsite acumula (a GFS só corre no bucket local)         |
| Healthcheck       | `HEALTHCHECKS_URL_OFFSITE` (opcional no código; **recomendado** em prod) |

### 9.1. Limitações conhecidas

1. **Sem object-lock nem versioning.** O token do R2 tem permissão de escrita e vive no env do
   contentor `cron`: um RCE nesse contentor apaga a produção **e** a cópia offsite. Mitigação
   recomendada (ainda não implementada): versioning + object-lock com retenção de 30 dias no R2.
2. **Credencial única.** O mesmo token serve para escrever (cron) e ler (restauros); devia ser
   só-escrita para o cron e só-leitura para restauros.
3. **Sem retenção offsite.** Cresce ~220 MiB/ano — sem urgência de espaço, mas falta política
   (lifecycle rule no R2 ou `--remove` mensal alinhado com a GFS local).
4. **Sem validação de conteúdo no servidor.** O dump é encriptado em streaming e a chave privada
   está offline por desenho: só o tamanho é verificável no servidor (§9.2). O drill trimestral
   (`docs/RESTORE.md` §6) é o que valida o conteúdo.

### 9.2. Incidente histórico — o objecto de 200 B

`postgres/2026/08/postgres-2026-08-25_135207.dump.age` tem **200 bytes** (primeira execução manual).
É o header `age` de um dump que morreu a meio da pipeline: `pg_dump` falhou, o `age` fechou o header
e o `mc pipe` gravou o que recebeu. O guard antigo (`SIZE -lt 100`) aceitou-o, o objecto foi
mirrorizado para o offsite e o dead-man-switch pingou **sucesso** — um dia de backups "verde" sem
conteúdo.

Correcção (AUDIT-OPS OPS-08): o limite passou a **4096 B** em `apps/api/scripts/backup-postgres.sh`,
o tamanho passou a ser logado no sucesso e a falha continua ruidosa (**exit 5**, sem ping de
sucesso). O teste `apps/api/src/lib/backup-postgres-size-guard.test.ts` corre o script real contra
stubs de `pg_dump`/`age`/`mc` e prova 200 B → falha · 4095 B → falha · 4096 B → passa · 153 568 B
→ passa. O objecto de 200 B **não** foi apagado: é evidência.

## 10. Melhorias pendentes (proposta — NÃO aplicada)

Fecha os pontos 1-3 de §9.1 (AUDIT-OPS OPS-09). **Nada disto está em produção**: cada item muda
configuração do bucket R2 ou do `cron` e precisa de uma janela própria com verificação de leitura de
volta. A ordem abaixo é deliberada — protegê-lo vem **antes** de apagar (um `--remove` sem
versioning/object-lock é a forma mais rápida de perder o offsite).

### 10.1. Versioning + object-lock no bucket R2 (fazer primeiro)

Hoje um RCE no contentor `cron` (que tem `OFFSITE_ACCESS_KEY` no env e `mc` na mão) apaga a produção
**e** a cópia offsite com um `mc rm --recursive` — o offsite não é imutável.

Proposta: activar **versioning** e **object-lock** (modo _compliance_, retenção 30 dias) em
`patacerta-backups-offsite`. Efeito: `DELETE` passa a criar um _delete marker_ e as versões ficam
indeléveis durante 30 dias — o pior caso passa de "perdi tudo" a "perdi 30 dias de escrita
maliciosa, tudo o resto está recuperável".

Pontos a confirmar no painel da Cloudflare antes de aplicar:

- O object-lock **pode ter de ser activado na criação do bucket** (R2 não o retro-instala em todos os
  casos). Se o bucket actual não o aceitar, o caminho é criar `patacerta-backups-offsite-locked`,
  `mc mirror` do actual para o novo (leitura, sem cortar o cron), trocar `OFFSITE_BUCKET` no Dokploy e
  só depois apagar o antigo — nunca "criar em paralelo e esquecer o antigo" (passaria a haver duas
  cópias a crescer).
- **Compatibilidade do `mc mirror --overwrite` com object-lock**: escrever por cima de um objecto
  retido cria uma versão nova (permitido); o que fica proibido é apagar/sobrescrever a versão retida.
  Testar com um prefixo descartável (`mc cp` + `mc rm` + `mc ls --versions`) antes de confiar.

### 10.2. Token separado para o `cron` (só-escrita) e para restauros (só-leitura)

Hoje uma credencial única serve escrita (cron) e leitura (restauro). Proposta:

| Token                    | Permissões no bucket offsite     | Onde vive                |
| ------------------------ | -------------------------------- | ------------------------ |
| `patacerta-cron-offsite` | Object Read & Write (sem delete) | env do contentor `cron`  |
| `patacerta-restore-ro`   | Object Read only                 | **não** fica no servidor |

Como R2 não tem IAM por prefixo, a separação efectiva é: o token do cron **não** pode apagar (o que
torna o `--remove` de 10.3 impossível de executar a partir do servidor comprometido) e o de restauro
só lê. Os dois tokens são criados no painel e guardados como secrets do Dokploy/cofre — nunca no
repo.

Nota: com o token do cron sem `delete`, a rotação offsite automática (10.3) deixa de correr a partir
do `cron`; passa a ser um passo **manual mensal** (fora do servidor, com o token de administração).
Esse é o compromisso consciente: retenção offsite não automática em troca de o offsite não ser
apagável a partir do servidor.

### 10.3. Retenção offsite — `--remove` mensal alinhado com a GFS

O `push-offsite.sh` faz `mc mirror --overwrite` **sem** `--remove` (§9), por isso o offsite nunca
perde nada: 187 objectos / 56,15 MiB em 92 dias (~220 MiB/ano). Não há urgência de espaço — há falta
de política.

Proposta (mensal, manual, a partir de uma máquina de confiança, **depois** de 10.1 e 10.2):

```sh
# 1. Espelhar o local (GFS já aplicada: ~17 objectos por categoria) para o offsite
#    apagando o que já não existe na origem.
mc mirror --overwrite --remove localbk/patacerta-backups offsite/patacerta-backups-offsite

# 2. Antes de correr a sério, um ensaio com o mesmo comando:
mc mirror --overwrite --remove --dry-run localbk/patacerta-backups offsite/patacerta-backups-offsite
```

Guardas obrigatórias antes de usar `--remove`:

1. **Contagem mínima na origem**: `mc ls --recursive | wc -l` tem de ser ≥ 10 (5 por categoria). Um
   bucket local vazio (bug, MinIO reinstalado) com `--remove` esvaziava o offsite.
2. **`--dry-run` primeiro**, sempre, e ler a lista (`Removing …`) antes do run real.
3. Nunca encadear com o `push-offsite.sh` diário (que continua `--overwrite` sem `--remove`): a
   remoção é um acto separado, mensal.
4. Healthcheck: se o passo for automatizado, tem de pingar `/start` e `/fail` como os outros
   (`rotate-backups.sh` é o modelo).

Alternativa sem código: lifecycle rule no R2 (ex.: expirar depois de 400 dias). É mais simples e
impossível de esvaziar o bucket por engano, mas expressa pior a GFS (7 diários + 4 semanais + 6
mensais) e, ao contrário do versioning de 10.1, **apaga sem rede**. Se for essa a escolha, manter
400 dias (muito acima da GFS local de 6 meses) para nunca ficar sem cópia redundante.

### 10.4. Checklist de aplicação (quando houver janela)

- [ ] 10.1 aplicado e provado: `mc ls --versions` mostra versões; `mc rm` de um objecto retido falha
- [ ] 10.2: dois tokens criados, `OFFSITE_*` do `cron` aponta ao só-escrita, teste `mc rm` → nega
- [ ] 10.3: ensaio `--remove --dry-run` lido e comparado com `mc ls` dos dois lados
- [ ] 10.3: `mc ls --recursive` do offsite ≤ ~40 objectos depois do primeiro mês
- [ ] Restore drill seguinte (§6 / `docs/RESTORE.md`) feito **a partir do offsite**, não do local
