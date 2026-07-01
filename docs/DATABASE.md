# PataCerta - Schema da Base de Dados

PostgreSQL 16 com Prisma ORM.

## Diagrama ER (Simplificado)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │──1:1──│   Breeder   │──N:M──│    Breed    │
└─────────────┘       └─────────────┘       └─────────────┘
      │                     │                     │
      │1:N                  │1:N                  │1:N
      ▼                     ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Service    │       │   Review    │       │SponsoredSlot│
└─────────────┘       └─────────────┘       └─────────────┘
      │
      │1:N
      ▼
┌─────────────┐
│ServiceReview│
└─────────────┘
```

## Entidades Principais

### User
Utilizador da plataforma. Pode ter multiplos roles atraves de relacoes.

```prisma
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String
  firstName     String
  lastName      String
  role          UserRole  @default(OWNER)
  phone         String?
  avatarUrl     String?
  isActive      Boolean   @default(true)
  emailVerified Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  breeder       Breeder?           // 1:1 - perfil de criador
  services      Service[]          // 1:N - servicos publicados
  reviews       Review[]           // 1:N - avaliacoes escritas
  refreshTokens RefreshToken[]     // 1:N - sessoes activas
}
```

### Breeder
Perfil de criador de animais. Requer verificacao DGAV.

```prisma
model Breeder {
  id             Int           @id
  userId         Int           @unique
  businessName   String
  slug           String        @unique   // URL-friendly
  nif            String        @unique
  dgavNumber     String        @unique
  description    String?
  status         BreederStatus @default(DRAFT)
  districtId     Int
  municipalityId Int
  avgRating      Float?                  // desnormalizado
  reviewCount    Int           @default(0)

  user           User
  breeds         BreederBreed[]          // N:M com Breed
  photos         BreederPhoto[]
  reviews        Review[]
}
```

### Service
Servico pet-related (dog-walking, pet-sitting, etc).

```prisma
model Service {
  id             Int           @id
  providerId     Int                     // FK para User
  categoryId     Int
  title          String
  slug           String        @unique
  description    String
  priceCents     Int
  priceUnit      PriceUnit
  districtId     Int
  municipalityId Int
  status         ServiceStatus @default(DRAFT)
  avgRating      Decimal       @default(0)
  reviewCount    Int           @default(0)
  latitude       Float?
  longitude      Float?

  provider       User
  category       ServiceCategory
  photos         ServicePhoto[]
  reviews        ServiceReview[]
}
```

### Breed
Catalogo de racas para o simulador "encontrar raca ideal".

```prisma
model Breed {
  id               Int     @id
  speciesId        Int
  nameSlug         String  @unique
  namePt           String
  size             String                // small|medium|large|giant
  energyLevel      Int                   // 1-5
  trainability     Int                   // 1-5
  goodWithKids     Int                   // 1-5
  apartmentFriendly Boolean
  // ... mais atributos

  breeders         BreederBreed[]
  sponsoredSlots   SponsoredBreedSlot[]
}
```

### Review / ServiceReview
Avaliacoes de criadores e servicos.

```prisma
model Review {
  id               Int          @id
  breederId        Int
  authorId         Int
  rating           Int                   // 1-5
  title            String
  body             String?
  status           ReviewStatus @default(PUBLISHED)
  reply            String?               // resposta do criador
  repliedAt        DateTime?

  @@unique([breederId, authorId])        // 1 review por autor/criador
}
```

### Thread / Message
Sistema de mensagens privadas.

```prisma
model Thread {
  id        Int       @id
  ownerId   Int                         // quem iniciou
  breederId Int?                        // conversa com criador
  serviceId Int?                        // conversa com servico
  subject   String

  @@unique([ownerId, breederId])
  @@unique([ownerId, serviceId])
}

model Message {
  id        Int       @id
  threadId  Int
  senderId  Int
  body      String
  readAt    DateTime?
  deletedAt DateTime?
}
```

### SponsoredBreedSlot
Slots patrocinados no simulador de racas (monetizacao).

```prisma
model SponsoredBreedSlot {
  id              Int       @id
  breederId       Int
  breedId         Int
  startsAt        DateTime
  endsAt          DateTime
  status          SponsoredBreedSlotStatus
  paymentStatus   SponsoredSlotPaymentStatus
  priceCents      Int?
  stripeSessionId String?   @unique
  impressionCount Int       @default(0)
  clickCount      Int       @default(0)
}
```

### RefreshToken
Refresh tokens com rotacao e revogacao.

```prisma
model RefreshToken {
  id           Int       @id
  userId       Int
  tokenHash    String    @unique   // SHA-256 do token
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById Int?               // chain de rotacao
  ipAddress    String?
  userAgent    String?
}
```

## Enums

```prisma
enum UserRole {
  OWNER            // Dono de animal (default)
  BREEDER          // Criador (legacy, agora via Breeder profile)
  SERVICE_PROVIDER // Provider de servicos (legacy)
  ADMIN            // Administrador
}

enum BreederStatus {
  DRAFT                // Rascunho
  PENDING_VERIFICATION // Aguarda verificacao DGAV
  VERIFIED             // Verificado e visivel
  SUSPENDED            // Suspenso por admin
}

enum ServiceStatus {
  DRAFT     // Rascunho
  ACTIVE    // Publicado
  PAUSED    // Pausado pelo dono
  SUSPENDED // Suspenso por admin
}

enum ReviewStatus {
  PUBLISHED // Visivel
  HIDDEN    // Escondido por admin
  FLAGGED   // Denunciado, aguarda revisao
}

enum PriceUnit {
  FIXED       // Preco fixo
  HOURLY      // Por hora
  PER_SESSION // Por sessao
}

enum DocType {
  NIF           // Comprovativo NIF
  DGAV          // Licenca DGAV
  CARTAO_CIDADAO
  CITES         // Para especies exoticas
  OTHER
}

enum VerificationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum SponsoredBreedSlotStatus {
  ACTIVE
  PAUSED
  EXPIRED
}

enum SponsoredSlotPaymentStatus {
  LEGACY    // Criado por admin (sem cobranca)
  PENDING   // Aguarda pagamento
  PAID      // Pago via Stripe
  FAILED    // Pagamento falhou
  REFUNDED  // Reembolsado
}
```

## Indices Importantes

### Breeder
```prisma
@@index([status])
@@index([districtId])
@@index([status, districtId])
@@index([status, createdAt(sort: Desc)])
@@index([status, avgRating(sort: Desc)])
@@index([status, featuredUntil])
```

### Service
```prisma
@@index([status])
@@index([categoryId])
@@index([status, categoryId])
@@index([status, categoryId, districtId])
@@index([status, avgRating(sort: Desc)])
@@index([status, latitude, longitude])
```

### Review
```prisma
@@unique([breederId, authorId])
@@index([breederId, status, createdAt])
```

### AuditLog
```prisma
@@index([userId, createdAt(sort: Desc)])
@@index([action, createdAt(sort: Desc)])
@@index([entity, entityId])
```

## Tabelas de Lookup

### District / Municipality
Distritos e concelhos de Portugal (seed estatico).

### Species
Especies de animais (cao, gato, etc).

### ServiceCategory
Categorias de servicos (passeios, pet-sitting, etc).

## Migracoes

As migracoes vivem em `apps/api/prisma/migrations/`.

```bash
# Desenvolvimento - criar migracao
pnpm --filter @patacerta/api db:migrate

# Producao - aplicar migracoes
pnpm --filter @patacerta/api db:migrate:deploy
```

> **Nota:** Em producao, as migracoes sao aplicadas automaticamente pelo entrypoint do container antes de iniciar o servidor.
