# Processo de release auditado (`dev` → produção)

Processo usado na promoção de 2026-11-24 (89 commits, zero rollback). Aplica-se a qualquer release que envolva feature nova, migração de base de dados ou alteração de autenticação/infra.

## Princípio

Nada chega a `main` sem: auditoria escrita, correções com teste, gate de QA contra stage, ponto de restauro confirmado e verificação do site depois do deploy. O trabalho é decomposto em cards kanban encadeados; **um worker de cada vez a escrever no repositório**.

## Cadeia de cards

| #   | Card                 | O que faz                                                                                                | Gate de saída                     |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | **AUD-SEC**          | Auditoria de segurança (OWASP) ao delta `main..dev` + módulo novo + reverificação de findings anteriores | `AUDIT-SEC.md` + `GO/NO-GO`       |
| 2   | **AUD-REL**          | Prontidão de release: contrato API↔web, migrações, env vars, build, CSP/nginx, rollback, CI              | `AUDIT-REL.md` + `GO/NO-GO`       |
| 3   | **AUD-OPS**          | Backups reais + hash + offsite, drill de restauro, hardening, capacidade, monitorização                  | `AUDIT-OPS.md` + `GO/NO-GO`       |
| 4   | **FIX-\***           | Um card por grupo de findings; implementa + teste + commit em `dev`                                      | testes verdes + commit            |
| 5   | **QA**               | Typecheck/format/testes/build + suite Playwright completa contra stage + asserts da release              | `PROMOTE` ou `BLOCK`              |
| 6   | **PROD-ENV**         | Configurar o env do stack de produção no Dokploy (com backup integral antes)                             | `docker compose config -q` exit 0 |
| 7   | **BACKUP-PREDEPLOY** | Confirmar dump mais recente, hash, offsite; registar baseline e deployment id                            | `PRE-DEPLOY-CHECKPOINT.md`        |
| 8   | **DEPLOY-PROD**      | PR `dev`→`main`, checks verdes, merge, acompanhar deployment, verificar o site                           | evidência de produção             |
| 9   | **POS-DEPLOY**       | Proteção do `main`, backlog P2                                                                           | proteção activa                   |

As auditorias e os cards de correção são **encadeados com dependências** (o próximo só arranca quando o anterior fecha). Dois workers do mesmo perfil no mesmo diretório colidem na _owner admission_ — paralelismo só entre perfis diferentes.

## Pré-condições de deploy (verificar sempre)

1. QA `PASS`/`PROMOTE`.
2. Env de produção completo. O compose usa `${ADMIN_PASSWORD:?}`: se a variável faltar, **o deploy aborta na interpolação**. Provar com `docker compose -f docker-compose.dokploy.yml config -q` e um controlo negativo.
3. Ponto de restauro confirmado (dump encriptado, hash, cópia offsite) e commit anterior registado.
4. `git merge-base --is-ancestor origin/main origin/dev` (ou PR sem conflitos).
5. CI/E2E verdes no commit a promover.
6. Working tree limpo de ficheiros versionados.

## Verificação de produção

```bash
curl -sI https://patacerta.pt/ | grep -iE '^last-modified|^content-security-policy|^strict-transport|x-robots-tag'
curl -s https://patacerta.pt/api/health
curl -s https://patacerta.pt/api/status        # uptimeSeconds = build novo (não existe em builds antigos)
curl -s https://patacerta.pt/api/breeds | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' https://patacerta.pt/api/feedback/mine   # 401
```

Esperado: CSP enforcing com `frame-src` do YouTube, HSTS 1 ano, **sem** `x-robots-tag` (só stage injecta `noindex`), rotas novas a devolver 401 JSON, e o sitemap/robots no apex.

O `last-modified` do `/` **não muda** em commits que só alteram a API — usar `uptimeSeconds` como âncora.

## Rollback

`main` está protegido e a promoção é por PR, logo o merge deixa commit:

```bash
git revert -m 1 <merge_commit>    # ou `git revert <commit>` com squash/rebase
git push origin main
```

Migrações aditivas (`CREATE TABLE`, `UPDATE` idempotente) são compatíveis com o código anterior — **não** é preciso reverter a base de dados. Provar isso antes do deploy, aplicando o código antigo a uma BD migrada num Postgres descartável.

## Limitações do Dokploy v0.31.2

- Sem exec/logs pela API: não há dumps on-demand nem leitura de logs de contentor. A verificação de migrações é indirecta (uptime, rotas, dados) e deve ser declarada como tal.
- API útil (read-only): `GET /api/project.all`, `GET /api/compose.one?composeId=…`, `GET /api/deployment.allByCompose?composeId=…`, com header `x-api-key`.
- Editar o `env` pela API: gravar o valor atual num ficheiro `chmod 600`, preservar as linhas existentes byte-a-byte, remover apenas linhas sem `=` nem `#`, e ler de volta para comparar **conjuntos de chaves**.
- Rate limit de produção (200 pedidos/15 min por IP) obriga a correr o smoke `@prod-safe` em chunks.

## Documentos relacionados

- `docs/DEPLOYMENT.md` — deploy e promoção por PR.
- `docs/BACKUP.md` / `docs/RESTORE.md` — backups, restauro e drill trimestral.
- `docs/PRODUCTION_CHECKLIST.md` — checklist de prontidão.
- `docs/releases/` — notas de release.
