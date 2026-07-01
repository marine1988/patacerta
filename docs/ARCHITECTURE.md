# PataCerta - Arquitetura

Plataforma de criadores de animais verificados em Portugal.

## Stack Tecnologico

### Backend (`apps/api/`)
| Tecnologia | Versao | Funcao |
|------------|--------|--------|
| Node.js | >=20 | Runtime |
| Express.js | 4.x | Framework HTTP |
| Prisma | 5.x | ORM |
| PostgreSQL | 16 | Base de dados |
| Redis | 7 | Rate limiting + cache |
| MinIO | latest | Armazenamento S3-compatible |
| Zod | 3.x | Validacao de schemas |
| JWT | - | Autenticacao |
| Stripe | - | Pagamentos |
| Resend | - | Emails transacionais |

### Frontend (`apps/web/`)
| Tecnologia | Versao | Funcao |
|------------|--------|--------|
| React | 18.x | UI Framework |
| Vite | 5.x | Build tool |
| TailwindCSS | 3.x | Styling |
| React Router | 6.x | Routing |
| TanStack Query | 5.x | Data fetching + cache |
| Axios | 1.x | HTTP client |
| Leaflet | 1.9 | Mapas |
| Stripe.js | - | Pagamentos frontend |

### Shared (`packages/shared/`)
- Schemas Zod partilhados entre API e frontend
- Types TypeScript comuns

## Estrutura de Pastas

```
patacerta/
├── apps/
│   ├── api/                    # Backend Express
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Schema da DB
│   │   │   ├── migrations/     # Migracoes Prisma
│   │   │   ├── seed.ts         # Seed dados base
│   │   │   └── seed-demo.ts    # Seed dados demo
│   │   └── src/
│   │       ├── index.ts        # Entry point
│   │       ├── modules/        # Feature modules
│   │       │   ├── auth/       # Autenticacao
│   │       │   ├── breeders/   # Criadores
│   │       │   ├── services/   # Servicos (dog-walking, etc)
│   │       │   ├── breeds/     # Catalogo racas
│   │       │   ├── reviews/    # Avaliacoes
│   │       │   ├── messages/   # Mensagens privadas
│   │       │   ├── admin/      # Painel admin
│   │       │   ├── payments/   # Stripe checkout
│   │       │   └── ...
│   │       ├── middleware/     # Auth, rate-limit, validation
│   │       ├── lib/            # Prisma, Redis, MinIO, JWT, Email
│   │       └── jobs/           # Cron jobs (cleanup, expire slots)
│   │
│   └── web/                    # Frontend React
│       ├── src/
│       │   ├── App.tsx         # Rotas principais
│       │   ├── pages/          # Paginas por feature
│       │   │   ├── home/
│       │   │   ├── auth/
│       │   │   ├── pesquisar/
│       │   │   ├── dashboard/
│       │   │   ├── admin/
│       │   │   └── ...
│       │   ├── components/     # Componentes reutilizaveis
│       │   ├── hooks/          # Custom hooks
│       │   ├── contexts/       # React contexts (Auth, etc)
│       │   └── lib/            # Utils, API client
│       └── Dockerfile
│
├── packages/
│   └── shared/                 # Schemas e types partilhados
│
├── docker-compose.yml          # Dev local
├── docker-compose.dokploy.yml  # Producao
└── package.json                # Monorepo root (pnpm workspaces)
```

## Fluxo de Dados

```
┌─────────────┐     HTTPS      ┌─────────────┐
│   Browser   │ ◄────────────► │    nginx    │
│  (React)    │                │   (web)     │
└─────────────┘                └──────┬──────┘
                                      │ /api/*
                                      ▼
                               ┌─────────────┐
                               │   Express   │
                               │    (api)    │
                               └──────┬──────┘
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
             ┌───────────┐     ┌───────────┐     ┌───────────┐
             │ PostgreSQL│     │   Redis   │     │   MinIO   │
             │   (data)  │     │  (cache)  │     │  (files)  │
             └───────────┘     └───────────┘     └───────────┘
```

### Request Flow
1. Browser faz pedido ao nginx (porta 80/443)
2. nginx serve assets estaticos ou proxia `/api/*` para Express
3. Express valida JWT, aplica rate-limits, executa controller
4. Controller usa Prisma para queries DB
5. Resposta JSON retorna ao browser

### Autenticacao Flow
1. Login: POST `/api/auth/login` -> JWT access (15min) + refresh token (7d, httpOnly cookie)
2. API requests: `Authorization: Bearer <access_token>`
3. Refresh: POST `/api/auth/refresh` com cookie -> novo access token
4. Logout: POST `/api/auth/logout` -> revoga refresh tokens

## Padroes Utilizados

### Modular Architecture
Cada feature em `modules/` contem:
- `*.router.ts` - Rotas Express
- `*.controller.ts` - Handlers HTTP
- `*.service.ts` (opcional) - Logica de negocio

### Validacao com Zod
Schemas definidos em `@patacerta/shared`, validados via middleware:
```typescript
// Middleware
router.post('/', validate(createServiceSchema), createService)

// Controller recebe body tipado e validado
const data = req.body as z.infer<typeof createServiceSchema>
```

### Error Handling
AppError centralizado com codigo HTTP + codigo interno:
```typescript
throw new AppError(404, 'Criador nao encontrado', 'BREEDER_NOT_FOUND')
```

### Rate Limiting
Buckets separados por endpoint com Redis (fallback in-memory):
- `auth-login`: 10/15min
- `auth-register`: 5/hora
- `api` global: 200/15min
- `upload`: 20/hora
- `search`: 30/min

### Autorizacao
Middlewares compostos:
```typescript
// Requer JWT + role ADMIN + conta activa
adminRouter.use(requireAuth, requireRole('ADMIN'), requireActiveUser)

// Requer JWT + perfil de criador
breedersRouter.patch('/me', requireAuth, requireBreederProfile, ...)
```

### File Uploads
- Multer para parsing multipart
- Sharp para resize/compressao de imagens
- MinIO para storage (S3-compatible)
- URLs assinadas para download
