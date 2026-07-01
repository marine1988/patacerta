# PataCerta - Documentacao da API

Base URL: `/api`

## Autenticacao

A API usa JWT com access tokens (15min) e refresh tokens (7d).

### Headers
```
Authorization: Bearer <access_token>
```

### Refresh Token
O refresh token e enviado como cookie `httpOnly`:
```
Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict
```

### Endpoints de Auth

| Metodo | Endpoint | Descricao | Rate Limit |
|--------|----------|-----------|------------|
| POST | `/auth/register` | Criar conta | 5/hora |
| POST | `/auth/login` | Login | 10/15min |
| POST | `/auth/refresh` | Renovar access token | 30/5min |
| POST | `/auth/logout` | Terminar sessao | - |
| POST | `/auth/verify-email` | Verificar email | 10/hora |
| POST | `/auth/resend-verification` | Reenviar email verificacao | 3/hora (por email) |
| POST | `/auth/forgot-password` | Pedir reset password | 5/hora (por email) |
| POST | `/auth/reset-password` | Definir nova password | 10/hora |

#### Exemplo: Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "MinhaPassword123"
}
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "Joao",
    "lastName": "Silva",
    "role": "BREEDER"
  }
}
```

## Endpoints Principais

### Criadores (Breeders)

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| GET | `/breeders/:id` | Nao | Ver perfil publico (id ou slug) |
| POST | `/breeders` | Sim | Criar perfil de criador |
| GET | `/breeders/me/profile` | Sim | Ver meu perfil |
| PATCH | `/breeders/me` | Sim | Editar meu perfil |
| DELETE | `/breeders/me` | Sim | Apagar meu perfil |
| POST | `/breeders/me/submit-verification` | Sim | Submeter para verificacao |
| POST | `/breeders/me/photos` | Sim | Upload fotos |
| PATCH | `/breeders/me/photos/reorder` | Sim | Reordenar fotos |
| DELETE | `/breeders/me/photos/:photoId` | Sim | Apagar foto |

#### Exemplo: Criar Perfil
```bash
POST /api/breeders
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessName": "Canil das Estrelas",
  "nif": "123456789",
  "dgavNumber": "DGAV-2024-001",
  "districtId": 11,
  "municipalityId": 1101,
  "breedIds": [1, 5, 12],
  "phone": "+351912345678",
  "website": "https://canilestrelas.pt",
  "description": "Criador de Labrador Retriever desde 2010..."
}
```

### Servicos

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| GET | `/services` | Nao | Listar servicos (com filtros) |
| GET | `/services/map` | Nao | Servicos para mapa (lat/lng) |
| GET | `/services/categories` | Nao | Categorias activas |
| GET | `/services/:id` | Nao | Detalhe do servico |
| GET | `/services/mine` | Sim | Meus servicos |
| POST | `/services` | Sim | Criar servico |
| PATCH | `/services/:id` | Sim | Editar servico |
| DELETE | `/services/:id` | Sim | Apagar servico |
| POST | `/services/:id/publish` | Sim | Publicar servico |
| POST | `/services/:id/pause` | Sim | Pausar servico |
| POST | `/services/:id/photos` | Sim | Upload fotos |
| POST | `/services/:id/contact` | Sim | Iniciar conversa |
| POST | `/services/:id/report` | Sim | Denunciar servico |

#### Exemplo: Listar com Filtros
```bash
GET /api/services?categoryId=1&districtId=11&page=1&limit=20&sort=price_asc
```

Response:
```json
{
  "data": [
    {
      "id": 1,
      "title": "Dog Walking Premium",
      "slug": "dog-walking-premium-1",
      "description": "Passeios personalizados...",
      "priceCents": 1500,
      "priceUnit": "HOURLY",
      "category": { "id": 1, "namePt": "Passeios" },
      "district": { "namePt": "Lisboa" },
      "avgRating": "4.50",
      "reviewCount": 12
    }
  ],
  "total": 45,
  "page": 1,
  "totalPages": 3
}
```

### Racas (Breeds)

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| GET | `/breeds` | Nao | Listar todas as racas |

### Pesquisa

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| GET | `/search/breeders` | Nao | Pesquisar criadores |
| GET | `/search/map` | Nao | Criadores para mapa |

### Avaliacoes (Reviews)

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| GET | `/reviews/breeder/:breederId` | Nao | Avaliacoes de um criador |
| POST | `/reviews` | Sim | Criar avaliacao |
| POST | `/reviews/:id/flag` | Sim | Denunciar avaliacao |
| POST | `/reviews/:id/reply` | Sim | Responder (como criador) |

### Mensagens

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| GET | `/messages/threads` | Sim | Minhas conversas |
| GET | `/messages/threads/:id` | Sim | Mensagens de uma conversa |
| POST | `/messages/threads/:id/messages` | Sim | Enviar mensagem |
| POST | `/messages/threads/:id/read` | Sim | Marcar como lidas |

### Pagamentos (Stripe)

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| POST | `/payments/sponsored-slot/checkout` | Sim | Criar checkout para slot patrocinado |
| GET | `/payments/sponsored-slot/:slotId/status` | Sim | Estado do pagamento |

### Webhooks

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| POST | `/webhooks/stripe` | Header Stripe | Eventos Stripe |

> **Nota:** O webhook Stripe usa `express.raw()` para validar a assinatura.

### Admin

Todos os endpoints admin requerem `role: ADMIN`.

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/admin/stats` | Dashboard stats |
| GET | `/admin/pending-counts` | Contadores pendentes |
| GET | `/admin/verifications/pending` | Fila de verificacoes |
| GET | `/admin/users` | Listar utilizadores |
| GET | `/admin/users/:id` | Detalhe utilizador |
| PATCH | `/admin/users/:id/suspend` | Suspender utilizador |
| PATCH | `/admin/users/:id/unsuspend` | Reactivar utilizador |
| GET | `/admin/breeders` | Listar criadores |
| GET | `/admin/breeders/:id` | Detalhe criador |
| PATCH | `/admin/breeders/:id/suspend` | Suspender criador |
| GET | `/admin/services` | Listar servicos |
| POST | `/admin/services/:id/suspend` | Suspender servico |
| GET | `/admin/reviews/flagged` | Avaliacoes denunciadas |
| GET | `/admin/message-reports` | Denuncias de mensagens |
| GET | `/admin/service-reports` | Denuncias de servicos |
| GET | `/admin/audit-logs` | Logs de auditoria |
| GET | `/admin/sponsored-slots` | Slots patrocinados |
| POST | `/admin/sponsored-slots` | Criar slot (legacy) |

### Health

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/health` | Health check (retorna `{ status: "ok" }`) |

## Middlewares Importantes

### `requireAuth`
Valida JWT no header `Authorization: Bearer <token>`.
```typescript
// 401 se token ausente/invalido/expirado
throw new AppError(401, 'Token invalido ou expirado', 'INVALID_TOKEN')
```

### `requireRole(...roles)`
Verifica se o utilizador tem um dos roles especificados.
```typescript
requireRole('ADMIN')          // Apenas admin
requireRole('BREEDER', 'ADMIN') // Criador ou admin
```

### `requireActiveUser`
Verifica se a conta nao esta suspensa (query a DB).
Usado em mutations para fechar a janela de 15min do JWT.

### `requireBreederProfile`
Verifica se o utilizador tem um perfil de criador associado.

### `validate(schema, target?)`
Valida body/query/params com schema Zod.
```typescript
validate(createServiceSchema)           // valida req.body
validate(listServicesQuerySchema, 'query') // valida req.query
```

### Rate Limiters
Ver `apps/api/src/middleware/rate-limit.ts` para configuracao completa.

## Codigos de Erro

| Codigo | Significado |
|--------|-------------|
| `UNAUTHORIZED` | Token ausente |
| `INVALID_TOKEN` | Token invalido/expirado |
| `FORBIDDEN` | Sem permissoes |
| `ACCOUNT_SUSPENDED` | Conta suspensa |
| `VALIDATION_ERROR` | Dados invalidos |
| `NOT_FOUND` | Recurso nao encontrado |
| `RATE_LIMITED` | Demasiados pedidos |
| `DUPLICATE_ENTRY` | Conflito (ex: email ja existe) |

Formato de erro:
```json
{
  "error": "Mensagem em portugues",
  "code": "ERROR_CODE",
  "details": { ... }  // opcional, para erros de validacao
}
```
