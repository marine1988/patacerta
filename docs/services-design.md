# Serviços — Design & Plano de Implementação

> Estado: **proposta para revisão** (v2, alinhada com `apps/api/prisma/schema.sql`).
>
> Autor: sessão de design PataCerta
> Contexto: expandir a plataforma de "directório de criadores" para "portal unificado para patudos" (cães), começando por dog-walking e dog-sitting.

## 0. Nota crítica de arquitectura

O ficheiro `apps/api/prisma/schema.sql` (567 linhas, referência canónica) **já contém o design da vertical Services para v1.1**, com tabelas `services`, `service_categories`, `service_reviews`, full-text search em Português, triggers de rating, e `user_roles` para multi-role RBAC. **Este documento alinha-se com essa estrutura**, em vez de a substituir.

Observações:

- **`schema.sql` está dessincronizado do `schema.prisma` actual** noutras áreas (falta `email_verified`, `reset_token`, `message_reports`, `review_flags`, `archived_*At`, `editedAt`/`deletedAt` em messages, campos `latitude`/`longitude` em districts, `verifiedAt` em breeder, etc.). Ou seja, o `schema.prisma` foi evoluindo com migrations sem o `schema.sql` ser actualizado.
- **Conclusão operacional**: a fonte-de-verdade de runtime é o `schema.prisma` (+ migrations aplicadas). O `schema.sql` é um _design reference_. Esta implementação usa `schema.sql` como inspiração arquitectural mas adiciona ao `schema.prisma` de forma incremental.
- **Acção lateral recomendada** (noutra sessão): ressincronizar `schema.sql` a partir do `schema.prisma` actual, para voltar a ter um design-reference actual. Fora do scope desta iteração.

## 1. Visão

PataCerta passa a ser um hub com várias verticais, descobertas a partir de uma única entrada **Explorar**:

- **Criadores** (vertical actual)
- **Serviços** (nova vertical) — começa com passeio de cães (`passeio`) e pet sitting (`pet-sitting`), categorias já seeded em `schema.sql`
- **(Futuro)** Veterinário, Tosquia, Treino, Transporte, Fotografia, Outro — já todas seeded em `service_categories`

## 2. Decisões de produto (confirmadas)

| #   | Decisão                                  | Implicação técnica                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| 1   | **Geocoding activado desde o MVP**       | Nominatim (OSM, grátis, rate-limit 1 req/s). Geocoding server-side ao criar/editar anúncio. Cache em campos `latitude`/`longitude` do anúncio. Fallback: centróide do distrito (campos já existentes em `districts`).                                                      |
| 2   | **Máx. 8 fotos por anúncio**             | Validação no endpoint de upload. Frontend desactiva o botão ao atingir 8.                                                                                                                                                                                                  |
| 3   | **Foto máx. 2 MB, 1600 px (lado maior)** | `multer` limit `fileSize: 2 * 1024 * 1024`. Redimensionamento com `sharp` para 1600 px, qualidade JPEG 85. MIME types: `image/jpeg                                                                                                                                         | png | webp`. |
| 4   | **Preço obrigatório**                    | O `schema.sql` tem `price_cents INT` nullable (permite "sob consulta"). **Passamos a NOT NULL** para o MVP; futuros anúncios de categorias como "veterinario" podem voltar a aceitar null se necessário. Zod: `priceCents: z.int().positive().max(999999)` (€9999,99 max). |
| 5   | **Edição livre do anúncio**              | Sem janela temporal, sem tombstone. Só `updated_at`. Diferente do `Message`.                                                                                                                                                                                               |
| 6   | **Sem expiração** no MVP                 | Nenhum campo `expires_at`.                                                                                                                                                                                                                                                 |

## 3. Scope MVP

### Categorias activas (já seeded no `schema.sql` §8c)

- `passeio` — "Passeio de Cães"
- `pet-sitting` — "Pet Sitting"

As outras categorias (`veterinario`, `tosquia`, `treino`, `transporte`, `fotografia`, `outro`) ficam na tabela mas **filtradas fora da UI pública** por uma coluna `is_active_mvp` (ou whitelist hardcoded no controller). Assim podemos acender verticais novas sem mudanças de schema.

### Fora do scope MVP

- Reviews de serviços (tabela `service_reviews` já existe → congelada, activamos mais tarde)
- Sistema de verificação para prestadores (análogo ao DGAV) → v1.2
- Pagamentos integrados
- Reservas/calendário

## 4. Schema — delta sobre `schema.prisma` actual

> Tudo o que se segue é um **add-only delta**. Não remove nem altera modelos existentes, excepto `Thread` (polimórfico, ver §4.5) e `User.role` enum (adicionar valor `SERVICE_PROVIDER`).

### 4.1 Novos enums

```prisma
enum UserRole {
  OWNER
  BREEDER
  SERVICE_PROVIDER  // novo
  ADMIN
}

enum ServiceStatus {
  DRAFT
  ACTIVE
  PAUSED
  SUSPENDED
}

enum PriceUnit {
  FIXED         // preço único pelo serviço
  HOURLY        // €/hora
  PER_SESSION   // €/sessão (ex.: um passeio)
  // QUOTE deliberadamente omitido — preço obrigatório no MVP
}

enum ServiceReportStatus {
  PENDING
  RESOLVED
  DISMISSED
}
```

### 4.2 Tabela de lookup `ServiceCategory`

```prisma
model ServiceCategory {
  id       Int    @id @default(autoincrement())
  nameSlug String @unique @map("name_slug") @db.VarChar(50)
  namePt   String @map("name_pt") @db.VarChar(100)
  isActive Boolean @default(false) @map("is_active")  // UI whitelist — MVP: só passeio e pet-sitting true

  services Service[]

  @@map("service_categories")
}
```

### 4.3 Modelo `Service` (= anúncio de serviço)

```prisma
model Service {
  id             Int           @id @default(autoincrement())
  providerId     Int           @map("provider_id")      // FK directa a users
  categoryId     Int           @map("category_id")
  title          String        @db.VarChar(200)
  description    String        @db.Text
  priceCents     Int           @map("price_cents")       // em cêntimos, NOT NULL
  priceUnit      PriceUnit     @map("price_unit")
  districtId     Int           @map("district_id")
  municipalityId Int           @map("municipality_id")
  addressLine    String?       @map("address_line") @db.VarChar(255)
  latitude       Float?
  longitude      Float?
  geocodedAt     DateTime?     @map("geocoded_at")
  geocodeSource  String?       @map("geocode_source") @db.VarChar(20)
  serviceRadiusKm Int?         @map("service_radius_km")
  status         ServiceStatus @default(DRAFT)
  website        String?       @db.VarChar(255)
  phone          String?       @db.VarChar(20)

  // Agregados denormalizados (triggers — reservados para quando activarmos reviews)
  avgRating    Decimal @default(0) @map("avg_rating") @db.Decimal(3, 2)
  reviewCount  Int     @default(0) @map("review_count")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  provider       User                  @relation("service_provider", fields: [providerId], references: [id], onDelete: Cascade)
  category       ServiceCategory       @relation(fields: [categoryId], references: [id])
  district       District              @relation(fields: [districtId], references: [id])
  municipality   Municipality          @relation(fields: [municipalityId], references: [id])
  photos         ServicePhoto[]
  coverageAreas  ServiceCoverage[]
  reports        ServiceReport[]
  threads        Thread[]              @relation("thread_service")

  @@index([providerId])
  @@index([categoryId])
  @@index([districtId])
  @@index([status])
  @@index([status, categoryId])
  @@map("services")
}
```

**Diferenças vs. `schema.sql`**:

- `price_cents` NOT NULL (decisão #4)
- Acrescento: `address_line`, `latitude`, `longitude`, `geocoded_at`, `geocode_source`, `service_radius_km` (decisão #1)
- Acrescento: relação com `photos`, `coverage_areas`, `reports`, `threads`
- Mantém: `avg_rating`/`review_count`/triggers (preparado para quando activarmos reviews)
- Mantém: `search_vector` via SQL manual (Prisma não modela tsvector — adicionado na migration.sql como `Unsupported("tsvector")?`)

### 4.4 Modelos auxiliares

```prisma
model ServicePhoto {
  id        Int      @id @default(autoincrement())
  serviceId Int      @map("service_id")
  url       String   @db.VarChar(512)
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")

  service Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@index([serviceId, sortOrder])
  @@map("service_photos")
}

model ServiceCoverage {
  serviceId      Int @map("service_id")
  municipalityId Int @map("municipality_id")

  service      Service      @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  municipality Municipality @relation(fields: [municipalityId], references: [id])

  @@id([serviceId, municipalityId])
  @@index([municipalityId])
  @@map("service_coverage")
}

model ServiceReport {
  id         Int                 @id @default(autoincrement())
  serviceId  Int                 @map("service_id")
  reporterId Int                 @map("reporter_id")
  reason     String              @db.VarChar(500)
  status     ServiceReportStatus @default(PENDING)
  createdAt  DateTime            @default(now()) @map("created_at")
  reviewedBy Int?                @map("reviewed_by")
  reviewedAt DateTime?           @map("reviewed_at")
  resolution String?             @db.VarChar(500)

  service  Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  reporter User    @relation("service_report_reporter", fields: [reporterId], references: [id], onDelete: Cascade)
  reviewer User?   @relation("service_report_reviewer", fields: [reviewedBy], references: [id])

  @@index([serviceId])
  @@index([reporterId])
  @@index([status])
  @@map("service_reports")
}
```

**Nota**: `ServiceCoverage` é por **serviço** (não por prestador), porque não temos tabela `service_providers` — seguimos a estrutura do `schema.sql` onde prestador = user e cada anúncio tem a sua geografia. Simples e consistente.

### 4.5 `Thread` polimórfico

```prisma
model Thread {
  id              Int      @id @default(autoincrement())
  ownerId         Int      @map("owner_id")
  breederId       Int?     @map("breeder_id")         // nullable agora
  serviceId       Int?     @map("service_id")         // novo
  subject         String   @db.VarChar(200)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  archivedByOwnerAt   DateTime? @map("archived_by_owner_at")
  archivedByBreederAt DateTime? @map("archived_by_breeder_at")

  owner    User      @relation("thread_owner", fields: [ownerId], references: [id], onDelete: Cascade)
  breeder  Breeder?  @relation("thread_breeder", fields: [breederId], references: [id], onDelete: Cascade)
  service  Service?  @relation("thread_service", fields: [serviceId], references: [id], onDelete: Cascade)
  messages Message[]

  @@unique([ownerId, breederId])
  @@unique([ownerId, serviceId])
  @@index([ownerId])
  @@index([breederId])
  @@index([serviceId])
  @@index([updatedAt])
  @@map("threads")
}
```

**Migration SQL manual adicional**:

```sql
ALTER TABLE threads ADD CONSTRAINT chk_thread_target_exclusive
  CHECK (
    (breeder_id IS NOT NULL AND service_id IS NULL) OR
    (breeder_id IS NULL AND service_id IS NOT NULL)
  );
```

**Observação sobre `archivedByBreederAt`**: o nome mantém-se por retro-compatibilidade, mas semanticamente passa a significar "arquivado pelo lado do prestador/criador" (quem recebeu o contacto). Para clareza poderíamos renomear para `archivedByProviderAt` num refactor futuro — fora do scope deste PR.

### 4.6 `schema.sql` — reconciliação

O `schema.sql` já tem `services` / `service_categories` / `service_reviews` mas **diverge** do que vamos implementar no `schema.prisma`:

- Falta-lhe tudo o que foi adicionado ao `schema.prisma` após a sua última actualização (mensagens, archive, reports, etc.)
- Vai ficar ainda mais divergente com estas novas tabelas

**Decisão**: por agora, **não tocamos no `schema.sql`**. A migration Prisma é a autoridade. Numa sessão de limpeza separada, regeneramos `schema.sql` a partir do estado actual da DB (`pg_dump --schema-only`).

## 5. API — endpoints propostos

Base: `/api/v1`.

### 5.1 CRUD de serviço (autor)

| Método | Path                            | Auth                                                                      | Notas                                                                                                  |
| ------ | ------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| POST   | `/services`                     | Auth. Ao criar, se `user.role === OWNER`, promove para `SERVICE_PROVIDER` | Body: category, title, description, price_cents, price_unit, district, municipality, address?, radius? |
| PATCH  | `/services/:id`                 | Dono                                                                      | Edição livre                                                                                           |
| POST   | `/services/:id/publish`         | Dono                                                                      | DRAFT/PAUSED → ACTIVE                                                                                  |
| POST   | `/services/:id/pause`           | Dono                                                                      | ACTIVE → PAUSED                                                                                        |
| DELETE | `/services/:id`                 | Dono                                                                      | Soft-delete via `status=SUSPENDED` + `removed_reason`                                                  |
| POST   | `/services/:id/photos`          | Dono                                                                      | multipart, max 8 por serviço, resize via sharp                                                         |
| DELETE | `/services/:id/photos/:photoId` | Dono                                                                      |                                                                                                        |

### 5.2 Público

| Método | Path                  | Query params                                                                                                                                                                 |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/services`           | `categoryId`, `districtId`, `municipalityId`, `q` (full-text via tsvector), `priceMin`, `priceMax`, `lat`+`lng`+`radiusKm`, `sort` (recent/price/rating), `page`, `pageSize` |
| GET    | `/services/:id`       | —                                                                                                                                                                            |
| GET    | `/services/map`       | Payload leve para mapa (id, title, lat, lng, priceCents, category)                                                                                                           |
| GET    | `/service-categories` | Lista categorias com `isActive=true`                                                                                                                                         |

### 5.3 Contacto

| Método | Path                    | Notas                                                                 |
| ------ | ----------------------- | --------------------------------------------------------------------- |
| POST   | `/services/:id/contact` | Cria/retorna Thread (ownerId=actual, serviceId). 1ª mensagem no body. |

### 5.4 Denúncias e admin

| Método | Path                                 | Auth                      |
| ------ | ------------------------------------ | ------------------------- |
| POST   | `/services/:id/report`               | Auth                      |
| GET    | `/admin/service-reports`             | ADMIN                     |
| POST   | `/admin/service-reports/:id/resolve` | ADMIN + AuditLog          |
| POST   | `/admin/service-reports/:id/dismiss` | ADMIN + AuditLog          |
| POST   | `/admin/services/:id/suspend`        | ADMIN + AuditLog + reason |

### 5.5 `/admin/pending-counts`

```diff
 {
   pendingDocs, pendingBreeders, flaggedReviews,
   pendingMessageReports,
+  pendingServiceReports,
   total,
 }
```

## 6. Frontend

### 6.1 Reorganização da navegação

| Antes     | Depois             |
| --------- | ------------------ |
| Diretório | **Explorar** (hub) |
| Mapa      | _(absorvido)_      |
| Mensagens | Mensagens          |
| Painel    | Painel             |

Rota: `/explorar?tipo=criadores|servicos|mapa` + redirects de `/diretorio` e `/mapa`.

### 6.2 Páginas novas

- `/explorar` — hub com tabs (Criadores / Serviços / Mapa)
- `/servicos` — alias directo
- `/servicos/:id` — detalhe do serviço (fotos, descrição, preço, prestador, botão "Contactar")
- `/painel?tab=servicos` — tab no Dashboard para gerir os próprios anúncios (lista + formulário create/edit)
- `/admin` — nova secção "Denúncias de serviços"

### 6.3 Componentes novos

- `ServiceCard` (grelha)
- `ServiceDetail`
- `ServiceForm` (criar/editar, com upload de fotos, mapa picker de morada)
- `ServiceFilters` (categoria, distrito, concelho, preço, raio)
- `ServiceMapMarker` (reutiliza infra existente)

### 6.4 Reutilização

- Sistema de mensagens — sem alterações visuais; quando `thread.serviceId` está preenchido, header mostra "Serviço: {title}" em vez de "Criador: ..."
- Componente de upload de fotos — factorizar do existente se houver

## 7. Plano de PRs

> **Nota operacional crítica**: o stage usa `prisma db push` (ver `apps/api/entrypoint.sh`), não `migrate deploy`. Isso significa:
>
> - O `schema.prisma` é aplicado directamente em cada deploy
> - **Não escrevemos migrations SQL à mão** neste PR
> - Features que o Prisma não modela (CHECK constraints polimórficos, índices GIN tsvector, triggers Postgres) ficam **fora do PR-1** e são adicionadas quando migrarmos para `migrate deploy`
> - Consequências imediatas:
>   - CHECK constraint `(breeder_id XOR service_id)` no Thread → **validação em application code** (service layer)
>   - Full-text search com `tsvector` → **substituído por ILIKE** no MVP (padrão já usado no resto do código)
>   - Triggers de `avg_rating`/`review_count` → **campos existem mas não são mantidos**; reviews de serviços estão fora do MVP de qualquer modo

| PR       | Conteúdo                                                                                                                                    | Smoke test                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **PR-1** | Schema Prisma (enums, tabelas novas, Thread polimórfico). Seed: `ServiceCategory` populada + flag `is_active`. Sem controllers              | `prisma db push` aplica limpo em stage; `prisma generate` ok; API arranca |
| **PR-2** | Backend CRUD Service + upload fotos (sharp, MinIO) + geocoding Nominatim. Validação aplicacional do XOR no Thread. Guards, DTOs zod, testes | Postman: criar Service, editar, upload 8 fotos, rejeitar 9ª               |
| **PR-3** | Backend público (listagem com ILIKE/filtros geo) + contacto (Thread polimórfico) + reports + admin                                          | cURL com `?q=passear`, `?radiusKm=10`, `/services/:id/contact`            |
| **PR-4** | Frontend Dashboard tab Serviços (CRUD UI, upload, mapa de morada)                                                                           | Utilizador-teste no stage cria anúncio, upload, publica                   |
| **PR-5** | Frontend público (ExplorarPage com tabs, ServicesList, detalhe, mapa combinado, redirects, badge admin)                                     | Browser: explorar → filtrar → contactar → mensagem entra no inbox         |

## 8. Riscos & observações

- **`search_vector tsvector`**: Prisma 5 não tem tipo nativo. Usar `Unsupported("tsvector")?` no schema e adicionar a coluna + triggers na migration SQL manual. Query server-side faz `Prisma.sql\`... @@ plainto_tsquery('portuguese', ${q})\``.
- **`CHECK constraint` polimórfico**: escrita manual na migration SQL. Prisma não modela, mas honra ao inserir porque nunca inseriremos com ambos NULL/ambos preenchidos.
- **`uq_thread_owner_breeder` → polimórfico**: `@@unique([ownerId, breederId])` + `@@unique([ownerId, serviceId])` são dois constraints independentes. Postgres trata NULL como distinto, portanto não há conflito quando um dos campos é NULL.
- **Promoção de role**: ao criar o primeiro serviço, se `user.role = OWNER`, actualiza para `SERVICE_PROVIDER`. Se já for `BREEDER`, mantemos `BREEDER` e adicionamos linha em `user_roles` (quando implementarmos `user_roles` — por agora o enum bastante). **Recomendação operacional**: guards verificam capability por relações (user tem Breeder? user tem Service?) em vez do enum role.
- **Rate-limit**: máx. 3 serviços criados/dia/user não-verificado, para conter abuso.
- **Nominatim**: User-Agent com email obrigatório pela policy OSM. Variável de ambiente `NOMINATIM_EMAIL`.
- **`schema.sql` dessincronizado**: risco assumido; resolver em sessão separada.

---

**Próximo passo**: começar PR-1 (schema.prisma + migration.sql manual). Confirmas?
