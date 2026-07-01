# PataCerta - Setup de Desenvolvimento

## Pre-requisitos

- Node.js >= 20
- pnpm >= 9
- Docker e Docker Compose

## Quick Start

```bash
# 1. Clonar repositorio
git clone https://github.com/xxx/patacerta.git
cd patacerta

# 2. Instalar dependencias
pnpm install

# 3. Configurar ambiente
cp .env.example .env
# Editar .env se necessario

# 4. Iniciar servicos (Postgres, Redis, MinIO)
pnpm docker:up

# 5. Criar schema e seed
pnpm db:migrate
pnpm db:seed

# 6. Iniciar dev servers
pnpm dev
```

Aceder a:
- Frontend: http://localhost:5173
- API: http://localhost:3001/api
- MinIO Console: http://localhost:9001 (user: patacerta_minio)
- Prisma Studio: `pnpm db:studio` (http://localhost:5555)

## Comandos pnpm

### Root (monorepo)

| Comando | Descricao |
|---------|-----------|
| `pnpm dev` | Iniciar API + Web em paralelo |
| `pnpm dev:api` | Iniciar apenas API |
| `pnpm dev:web` | Iniciar apenas Web |
| `pnpm build` | Build de producao |
| `pnpm typecheck` | Verificar tipos TypeScript |
| `pnpm lint` | Correr linters |
| `pnpm format` | Formatar codigo (Prettier) |
| `pnpm test` | Correr testes |

### Base de Dados

| Comando | Descricao |
|---------|-----------|
| `pnpm db:migrate` | Criar/aplicar migracoes (dev) |
| `pnpm db:seed` | Seed dados base (distritos, categorias, admin) |
| `pnpm db:studio` | Abrir Prisma Studio |

### Docker

| Comando | Descricao |
|---------|-----------|
| `pnpm docker:up` | Iniciar Postgres + Redis + MinIO |
| `pnpm docker:down` | Parar containers |

## Estrutura de Testes

### API (`apps/api/`)

Testes unitarios com Vitest:

```bash
# Correr testes
pnpm --filter @patacerta/api test

# Watch mode
pnpm --filter @patacerta/api test:watch
```

Localizacao: `apps/api/src/**/*.test.ts`

### Web (`apps/web/`)

Testes unitarios:
```bash
pnpm --filter @patacerta/web test
```

Testes E2E (Playwright):
```bash
# Instalar browsers
pnpm --filter @patacerta/web test:e2e:install

# Correr testes
pnpm --filter @patacerta/web test:e2e

# Modo UI
pnpm --filter @patacerta/web test:e2e:ui

# Modo headed (ver browser)
pnpm --filter @patacerta/web test:e2e:headed
```

Localizacao: `apps/web/e2e/**/*.spec.ts`

## Fluxo de Desenvolvimento

### Criar nova feature

1. Criar branch: `git checkout -b feat/nome-feature`
2. Implementar no modulo apropriado
3. Adicionar testes
4. Correr `pnpm typecheck && pnpm test`
5. Criar PR

### Adicionar endpoint API

1. Criar/editar router em `apps/api/src/modules/<modulo>/<modulo>.router.ts`
2. Criar controller em `<modulo>.controller.ts`
3. Adicionar schema Zod em `packages/shared/src/schemas/`
4. Testar com curl/Postman

Exemplo:
```typescript
// router
router.post('/', validate(createXxxSchema), createXxx)

// controller
export const createXxx = asyncHandler(async (req, res) => {
  const data = req.body as z.infer<typeof createXxxSchema>
  const result = await prisma.xxx.create({ data })
  res.status(201).json(result)
})
```

### Alterar schema DB

1. Editar `apps/api/prisma/schema.prisma`
2. Criar migracao: `pnpm db:migrate`
3. Nome descritivo: `add_xxx_table` ou `add_column_to_xxx`
4. Verificar SQL gerado em `prisma/migrations/`

### Adicionar pagina Web

1. Criar componente em `apps/web/src/pages/<feature>/`
2. Adicionar rota em `apps/web/src/App.tsx`
3. Usar lazy loading:
```typescript
const NovaPagina = lazy(() =>
  import('./pages/feature/NovaPagina').then((m) => ({ default: m.NovaPagina }))
)
```

## Variaveis de Ambiente (Dev)

Ficheiro `.env` na raiz:

```bash
# Geral
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL=postgresql://patacerta:patacerta_dev@localhost:5432/patacerta

# JWT (valores de dev, NAO usar em prod)
JWT_SECRET=dev-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=patacerta_minio
MINIO_SECRET_KEY=patacerta_minio_secret

# Frontend
VITE_API_URL=http://localhost:3001/api

# Dev flags (opcional)
AUTH_SKIP_EMAIL_VERIFICATION=true  # Bypass email em dev
DISABLE_RATE_LIMITS=true           # Desligar rate limits
```

## Debugging

### API

Usar VS Code debugger com configuracao:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug API",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["dev:api"],
  "cwd": "${workspaceFolder}"
}
```

Ou com `console.log` e `docker logs`:
```bash
docker logs patacerta-api -f
```

### Database

```bash
# Abrir Prisma Studio (GUI)
pnpm db:studio

# Ou conectar via psql
docker exec -it patacerta-postgres psql -U patacerta
```

### Redis

```bash
docker exec -it patacerta-redis redis-cli
> KEYS rl:*
> GET rl:auth-login:127.0.0.1
```

## Seed de Dados Demo

Para ter dados de teste (criadores, servicos, avaliacoes):

```bash
pnpm --filter @patacerta/api db:seed:demo
```

Ou via API (apenas em dev/stage):
```bash
curl -X POST http://localhost:3001/api/admin/internal/run-demo-seed \
  -H "Authorization: Bearer <admin_token>"
```

## Troubleshooting

### "Cannot connect to database"

```bash
# Verificar se Postgres esta a correr
docker ps | grep postgres

# Reiniciar
pnpm docker:down && pnpm docker:up
```

### "Port 5173 already in use"

```bash
# Encontrar processo
netstat -ano | findstr :5173
# Ou em Linux/Mac:
lsof -i :5173

# Matar processo ou usar porta diferente
VITE_PORT=5174 pnpm dev:web
```

### "Prisma client out of sync"

```bash
pnpm --filter @patacerta/api db:generate
```

### "MinIO bucket not found"

O bucket e criado automaticamente ao iniciar a API. Se falhar:

```bash
# Aceder ao MinIO console
# http://localhost:9001
# Criar bucket "patacerta-uploads" manualmente
```
