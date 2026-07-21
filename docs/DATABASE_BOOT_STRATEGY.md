# Estratégia de Arranque da Base de Dados

> **LÊ ISTO ANTES de tocar em `apps/api/entrypoint.sh` ou em migrations.**
> Este documento explica como a base de dados é preparada no arranque do
> container da API. Configuração errada aqui **causa perda de dados irreversível**.

O ficheiro que controla tudo isto é **`apps/api/entrypoint.sh`** (127 linhas).
Corre automaticamente quando o container `api` arranca, **antes** de iniciar o servidor.

---

## Fluxo de arranque (por ordem)

```
1. RESET_DB_ON_BOOT?  ──true──►  DROP SCHEMA public CASCADE + CREATE  (⚠️ APAGA TUDO)
        │ false/unset
        ▼
2. USE_DB_PUSH?  ──true──►  prisma db push --accept-data-loss  ──►  vai para os seeds
        │ false/unset
        ▼
3. backfill-slugs (idempotente, zero-op se já OK)
        ▼
4. prisma migrate deploy
        │
        └─ falhou com P3009? ──► auto-recovery (resolve rolled-back + applied) ──► re-tenta
        ▼
5. RUN_SEED_ON_BOOT?       ──true──►  tsx prisma/seed.ts        (dados base)
6. RUN_SEED_DEMO_ON_BOOT?  ──true──►  tsx prisma/seed-demo.ts   (dados demo)
        ▼
7. exec node apps/api/dist/index.js   (arranca o servidor)
```

---

## As duas estratégias de schema

Existem **dois modos** mutuamente exclusivos de aplicar o schema:

### A) `prisma migrate deploy` — **DEFAULT** (recomendado para prod)

- Aplica as migrations versionadas em `apps/api/prisma/migrations/`.
- Regista o que aplicou na tabela `_prisma_migrations`.
- **Seguro e auditável.** É o modo por omissão quando `USE_DB_PUSH` não está definido.

### B) `prisma db push` — só com `USE_DB_PUSH=1`

- Sincroniza a DB diretamente a partir de `schema.prisma`, **ignorando migrations**.
- Usa `--accept-data-loss` → pode **apagar colunas/tabelas** para bater certo com o schema.
- Útil em stage para iterar rápido sem criar migrations. **Evitar em produção.**

> **Regra:** produção usa **A** (migrate deploy). Só usar **B** conscientemente em stage.

---

## Variáveis que controlam o boot

| Variável                  | Efeito                                             | Risco                       |
| ------------------------- | -------------------------------------------------- | --------------------------- |
| `RESET_DB_ON_BOOT=1`      | Dropa e recria o schema `public`                   | 🔴 **APAGA TODOS OS DADOS** |
| `USE_DB_PUSH=1`           | Usa `db push --accept-data-loss` em vez de migrate | 🟠 Pode apagar colunas      |
| `RUN_SEED_ON_BOOT=1`      | Corre `seed.ts` (distritos, raças, admin)          | 🟢 Idempotente (upsert)     |
| `RUN_SEED_DEMO_ON_BOOT=1` | Corre `seed-demo.ts` (criadores/serviços fake)     | 🟢 Só dev/stage             |
| _(nenhuma)_               | migrate deploy + arranca                           | 🟢 Modo normal de produção  |

---

## Auto-recovery de P3009 (migrations falhadas)

Se `migrate deploy` falhar com o erro **P3009** ("migrate found failed migrations"),
o entrypoint tenta recuperar automaticamente (linhas 66-104):

1. Consulta `_prisma_migrations` por migrations não terminadas ou com rollback.
2. Para cada uma: `prisma migrate resolve --rolled-back` seguido de `--applied`.
3. Re-tenta `migrate deploy`.

Isto resolve o caso comum de uma migration que ficou "presa" a meio.

---

## Incidente conhecido: "relation does not exist" / tabelas em falta

**Sintoma:** logs mostram `relation "breeders" does not exist` ou
`The table public.users does not exist`, mas `migrate deploy` diz
`No pending migrations to apply`.

**Causa:** a tabela `_prisma_migrations` tem a migration marcada como aplicada,
mas as tabelas reais não existem (ex.: DB recriada sem limpar `_prisma_migrations`,
ou migration marcada como aplicada sem ter corrido).

**Fix manual (dentro do container `api`, em `/app/apps/api`):**

```bash
cd /app/apps/api

# Opção 1: forçar re-aplicação da migration
npx prisma migrate resolve --rolled-back 00001_init
npx prisma migrate deploy

# Opção 2 (se a 1 não bastar): sincronizar direto do schema
npx prisma db push

# Depois, popular dados base:
npx tsx prisma/seed.ts
```

> **Nota:** `npx prisma db seed` **não funciona** — não há `prisma.seed` no package.json.
> Usa sempre `npx tsx prisma/seed.ts` diretamente.

---

## Regras de ouro para agentes

1. **NUNCA** definas `RESET_DB_ON_BOOT=1` em produção sem confirmação explícita do utilizador.
2. **NUNCA** edites uma migration já aplicada em `apps/api/prisma/migrations/`. Cria uma nova.
3. Se precisares de mudar o schema em dev: edita `schema.prisma` → `pnpm db:migrate` (cria migration).
4. Em caso de dúvida sobre o estado da DB de produção → **PÁRA e pergunta**.
5. Migrations destrutivas (drop de coluna/tabela com dados) → **PÁRA e pergunta**.

---

## Ficheiros relacionados

- `apps/api/entrypoint.sh` — orquestração do boot (este documento explica-o)
- `apps/api/cron-entrypoint.sh` — arranque do container de cron (backups)
- `apps/api/prisma/schema.prisma` — fonte de verdade do schema
- `apps/api/prisma/migrations/` — migrations versionadas (**não editar aplicadas**)
- `apps/api/prisma/seed.ts` — dados base (idempotente)
- `apps/api/prisma/seed-demo.ts` — dados de demonstração
