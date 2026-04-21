-- ============================================================================
-- PataCerta — PostgreSQL Schema
-- Verified pet breeder marketplace for Portugal (pt-PT)
-- PostgreSQL 16+
-- ============================================================================
--
-- DESIGN DECISIONS
-- ────────────────
-- 1. SERIAL PKs:  Portugal-only market; int4 (~2.1B) is sufficient for all
--    entity tables. audit_logs uses BIGSERIAL for high-volume append-only writes.
-- 2. TIMESTAMPTZ:  All timestamps are timezone-aware (Portugal observes WET/WEST).
-- 3. snake_case:   All SQL identifiers use snake_case; Prisma @map() bridges to
--                  camelCase in TypeScript.
-- 4. Roles table:  A first-class `roles` + `user_roles` junction sits alongside
--                  the fast-path `role` enum column on `users`. The enum gives
--                  O(1) primary-role checks in middleware; the junction enables
--                  multi-role RBAC when Services launch in v1.1.
-- 5. Services:     Tables designed now (v1.1-ready) so the schema never needs a
--                  breaking migration when service providers are onboarded.
-- 6. Denormalized: avg_rating / review_count on breeders and services — kept in
--                  sync by triggers. Eliminates expensive aggregation on every
--                  directory page load.
-- 7. Full-text:    TSVECTOR columns with GIN indexes and Portuguese dictionary
--                  for search. Triggers auto-maintain the vector.
-- 8. RGPD:         consent_logs and audit_logs for compliance. users.is_active
--                  for soft-deactivation without data loss.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Extensions
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram fuzzy matching

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Enum types
-- ────────────────────────────────────────────────────────────────────────────
CREATE TYPE user_role           AS ENUM ('OWNER','BREEDER','SERVICE_PROVIDER','ADMIN');
CREATE TYPE breeder_status      AS ENUM ('DRAFT','PENDING_VERIFICATION','VERIFIED','SUSPENDED');
CREATE TYPE verification_status AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE doc_type            AS ENUM ('NIF','DGAV','CARTAO_CIDADAO','CITES','OTHER');
CREATE TYPE review_status       AS ENUM ('PUBLISHED','HIDDEN','FLAGGED');
CREATE TYPE service_status      AS ENUM ('DRAFT','ACTIVE','PAUSED','SUSPENDED');
CREATE TYPE price_unit          AS ENUM ('FIXED','HOURLY','PER_SESSION','QUOTE');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Reference / lookup tables
-- ────────────────────────────────────────────────────────────────────────────

-- 2a. RBAC roles (scalable; seed OWNER, BREEDER, SERVICE_PROVIDER, ADMIN)
CREATE TABLE roles (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,  -- matches enum literal
    description VARCHAR(200),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  roles IS 'Lookup table for RBAC roles. Seeded at deploy time.';
COMMENT ON COLUMN roles.name IS 'Machine-readable key, e.g. OWNER, BREEDER, ADMIN.';

-- 2b. Species
CREATE TABLE species (
    id        SERIAL       PRIMARY KEY,
    name_slug VARCHAR(50)  NOT NULL UNIQUE,   -- url-safe key: "cao", "gato"
    name_pt   VARCHAR(100) NOT NULL           -- display: "Cão", "Gato"
);

-- 2c. Districts (18 continental + 2 autonomous regions)
CREATE TABLE districts (
    id      SERIAL      PRIMARY KEY,
    code    VARCHAR(5)  NOT NULL UNIQUE,       -- INE code
    name_pt VARCHAR(100) NOT NULL
);

-- 2d. Municipalities (~308)
CREATE TABLE municipalities (
    id          SERIAL       PRIMARY KEY,
    district_id INT          NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
    code        VARCHAR(10)  NOT NULL UNIQUE,  -- INE code
    name_pt     VARCHAR(100) NOT NULL
);

-- 2e. Service categories (v1.1)
CREATE TABLE service_categories (
    id        SERIAL       PRIMARY KEY,
    name_slug VARCHAR(50)  NOT NULL UNIQUE,    -- "tosquia", "veterinario"
    name_pt   VARCHAR(100) NOT NULL            -- "Tosquia", "Veterinário"
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Core entity tables
-- ────────────────────────────────────────────────────────────────────────────

-- 3a. Users
CREATE TABLE users (
    id            SERIAL       PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    role          user_role    NOT NULL DEFAULT 'OWNER',  -- primary role (fast path)
    phone         VARCHAR(20),
    avatar_url    VARCHAR(512),
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN users.role IS 'Denormalized primary role for O(1) middleware checks. Canonical source: user_roles.';
COMMENT ON COLUMN users.is_active IS 'Soft-deactivation flag. false = account disabled (RGPD deactivation path).';

-- 3b. User-Roles junction (multi-role RBAC)
CREATE TABLE user_roles (
    user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    INT         NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

COMMENT ON TABLE user_roles IS 'Junction for multi-role RBAC. A user who is both BREEDER and SERVICE_PROVIDER has two rows.';

-- 3c. Breeders
CREATE TABLE breeders (
    id              SERIAL         PRIMARY KEY,
    user_id         INT            NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    business_name   VARCHAR(200)   NOT NULL,
    nif             VARCHAR(9)     NOT NULL,
    dgav_number     VARCHAR(50),
    description     TEXT,
    website         VARCHAR(255),
    phone           VARCHAR(20),
    status          breeder_status NOT NULL DEFAULT 'DRAFT',
    district_id     INT            NOT NULL REFERENCES districts(id),
    municipality_id INT            NOT NULL REFERENCES municipalities(id),

    -- Denormalized aggregates (trigger-maintained)
    avg_rating      NUMERIC(3,2)   NOT NULL DEFAULT 0,
    review_count    INT            NOT NULL DEFAULT 0,

    -- Full-text search (trigger-maintained)
    search_vector   TSVECTOR,

    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- Domain constraints
    CONSTRAINT chk_breeder_nif_length  CHECK (char_length(nif) = 9),
    CONSTRAINT chk_breeder_nif_numeric CHECK (nif ~ '^\d{9}$'),
    CONSTRAINT chk_breeder_avg_rating  CHECK (avg_rating >= 0 AND avg_rating <= 5),
    CONSTRAINT chk_breeder_review_count CHECK (review_count >= 0)
);

COMMENT ON COLUMN breeders.avg_rating IS 'Denormalized average of published reviews. Updated by trg_review_rating_sync.';
COMMENT ON COLUMN breeders.search_vector IS 'Portuguese tsvector over business_name (A) + description (B). Updated by trg_breeder_search_vector.';

-- 3d. Breeder ↔ Species (M:N)
CREATE TABLE breeder_species (
    breeder_id INT NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
    species_id INT NOT NULL REFERENCES species(id) ON DELETE CASCADE,
    PRIMARY KEY (breeder_id, species_id)
);

-- 3e. Services (v1.1 — tables created now, not populated until feature launch)
CREATE TABLE services (
    id              SERIAL          PRIMARY KEY,
    provider_id     INT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id     INT             NOT NULL REFERENCES service_categories(id),
    title           VARCHAR(200)    NOT NULL,
    description     TEXT,
    price_cents     INT,                              -- NULL = "sob consulta"
    price_unit      price_unit      NOT NULL DEFAULT 'FIXED',
    district_id     INT             NOT NULL REFERENCES districts(id),
    municipality_id INT             NOT NULL REFERENCES municipalities(id),
    status          service_status  NOT NULL DEFAULT 'DRAFT',
    website         VARCHAR(255),
    phone           VARCHAR(20),

    -- Denormalized aggregates (trigger-maintained)
    avg_rating      NUMERIC(3,2)    NOT NULL DEFAULT 0,
    review_count    INT             NOT NULL DEFAULT 0,

    -- Full-text search (trigger-maintained)
    search_vector   TSVECTOR,

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT chk_service_price_positive  CHECK (price_cents IS NULL OR price_cents >= 0),
    CONSTRAINT chk_service_avg_rating      CHECK (avg_rating >= 0 AND avg_rating <= 5),
    CONSTRAINT chk_service_review_count    CHECK (review_count >= 0)
);

COMMENT ON TABLE services IS 'v1.1 entity. Each row is one service listing by a SERVICE_PROVIDER user.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Feature tables
-- ────────────────────────────────────────────────────────────────────────────

-- 4a. Verification documents
CREATE TABLE verification_docs (
    id          SERIAL              PRIMARY KEY,
    breeder_id  INT                 NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
    doc_type    doc_type            NOT NULL,
    file_url    VARCHAR(512)        NOT NULL,
    file_name   VARCHAR(255)        NOT NULL,
    status      verification_status NOT NULL DEFAULT 'PENDING',
    notes       TEXT,
    reviewed_by INT                 REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT now()
);

-- 4b. Breeder reviews
CREATE TABLE reviews (
    id          SERIAL        PRIMARY KEY,
    breeder_id  INT           NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
    author_id   INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      SMALLINT      NOT NULL,
    title       VARCHAR(200)  NOT NULL,
    body        TEXT,
    status      review_status NOT NULL DEFAULT 'PUBLISHED',
    reply       TEXT,                                -- breeder's response
    replied_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_review_rating CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT uq_review_per_breeder UNIQUE (breeder_id, author_id)
);

COMMENT ON CONSTRAINT uq_review_per_breeder ON reviews IS 'One review per user per breeder. User must update existing review.';

-- 4c. Service reviews (v1.1)
CREATE TABLE service_reviews (
    id          SERIAL        PRIMARY KEY,
    service_id  INT           NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    author_id   INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      SMALLINT      NOT NULL,
    title       VARCHAR(200)  NOT NULL,
    body        TEXT,
    status      review_status NOT NULL DEFAULT 'PUBLISHED',
    reply       TEXT,
    replied_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_svc_review_rating CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT uq_review_per_service UNIQUE (service_id, author_id)
);

-- 4d. Messaging threads
CREATE TABLE threads (
    id          SERIAL       PRIMARY KEY,
    owner_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    breeder_id  INT          NOT NULL REFERENCES breeders(id) ON DELETE CASCADE,
    subject     VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 4e. Messages
CREATE TABLE messages (
    id          SERIAL      PRIMARY KEY,
    thread_id   INT         NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    sender_id   INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT        NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. System / compliance tables
-- ────────────────────────────────────────────────────────────────────────────

-- 5a. Audit log (append-only, high volume)
CREATE TABLE audit_logs (
    id          BIGSERIAL    PRIMARY KEY,             -- BIGSERIAL for high-volume
    user_id     INT          REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(50)  NOT NULL,                -- 'CREATE','UPDATE','DELETE','LOGIN'…
    entity      VARCHAR(50)  NOT NULL,                -- 'breeder','review','user'…
    entity_id   INT,
    details     TEXT,                                 -- JSON payload
    ip_address  VARCHAR(45),                          -- IPv4 or IPv6
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Append-only audit trail. Never UPDATE or DELETE rows.';

-- 5b. RGPD consent log
CREATE TABLE consent_logs (
    id           SERIAL       PRIMARY KEY,
    user_id      INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(50)  NOT NULL,               -- 'terms','privacy','marketing'
    granted      BOOLEAN      NOT NULL,
    ip_address   VARCHAR(45),
    user_agent   VARCHAR(500),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE consent_logs IS 'Immutable record of every RGPD consent grant/revoke event.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Indexes
-- ────────────────────────────────────────────────────────────────────────────

-- Users
CREATE INDEX idx_users_role       ON users (role);
CREATE INDEX idx_users_active     ON users (is_active) WHERE is_active = true;
CREATE INDEX idx_users_created_at ON users (created_at);

-- User roles
CREATE INDEX idx_user_roles_role  ON user_roles (role_id);

-- Municipalities
CREATE INDEX idx_municipalities_district ON municipalities (district_id);

-- Breeders: primary access patterns
CREATE INDEX idx_breeders_status       ON breeders (status);
CREATE INDEX idx_breeders_district     ON breeders (district_id);
CREATE INDEX idx_breeders_municipality ON breeders (municipality_id);
CREATE INDEX idx_breeders_nif          ON breeders (nif);

-- Breeders: full-text search (GIN)
CREATE INDEX idx_breeders_search ON breeders USING GIN (search_vector);

-- Breeders: directory page — only VERIFIED breeders, filterable by location
CREATE INDEX idx_breeders_verified_location
    ON breeders (district_id, municipality_id)
    WHERE status = 'VERIFIED';

-- Breeders: directory sort by rating (descending) — only VERIFIED
CREATE INDEX idx_breeders_verified_rating
    ON breeders (avg_rating DESC, review_count DESC)
    WHERE status = 'VERIFIED';

-- Breeder-Species: reverse lookup (which breeders have species X?)
CREATE INDEX idx_breeder_species_species ON breeder_species (species_id);

-- Services: primary access patterns
CREATE INDEX idx_services_provider   ON services (provider_id);
CREATE INDEX idx_services_category   ON services (category_id);
CREATE INDEX idx_services_district   ON services (district_id);
CREATE INDEX idx_services_status     ON services (status);

-- Services: full-text search (GIN)
CREATE INDEX idx_services_search ON services USING GIN (search_vector);

-- Services: directory page — only ACTIVE, filterable
CREATE INDEX idx_services_active_location
    ON services (district_id, category_id)
    WHERE status = 'ACTIVE';

-- Services: directory sort by rating
CREATE INDEX idx_services_active_rating
    ON services (avg_rating DESC, review_count DESC)
    WHERE status = 'ACTIVE';

-- Verification docs
CREATE INDEX idx_vdocs_breeder ON verification_docs (breeder_id);
CREATE INDEX idx_vdocs_status  ON verification_docs (status);
CREATE INDEX idx_vdocs_pending ON verification_docs (created_at) WHERE status = 'PENDING';

-- Reviews
CREATE INDEX idx_reviews_breeder   ON reviews (breeder_id);
CREATE INDEX idx_reviews_author    ON reviews (author_id);
CREATE INDEX idx_reviews_status    ON reviews (status);
CREATE INDEX idx_reviews_published ON reviews (breeder_id, rating) WHERE status = 'PUBLISHED';

-- Service reviews
CREATE INDEX idx_svc_reviews_service   ON service_reviews (service_id);
CREATE INDEX idx_svc_reviews_author    ON service_reviews (author_id);
CREATE INDEX idx_svc_reviews_published ON service_reviews (service_id, rating) WHERE status = 'PUBLISHED';

-- Threads
CREATE INDEX idx_threads_owner   ON threads (owner_id);
CREATE INDEX idx_threads_breeder ON threads (breeder_id);

-- Messages
CREATE INDEX idx_messages_thread ON messages (thread_id);
CREATE INDEX idx_messages_sender ON messages (sender_id);
CREATE INDEX idx_messages_unread ON messages (thread_id, created_at) WHERE read_at IS NULL;

-- Audit logs (high-volume queries)
CREATE INDEX idx_audit_user    ON audit_logs (user_id);
CREATE INDEX idx_audit_entity  ON audit_logs (entity, entity_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at);

-- Consent logs
CREATE INDEX idx_consent_user ON consent_logs (user_id);
CREATE INDEX idx_consent_type ON consent_logs (consent_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Functions & Triggers
-- ────────────────────────────────────────────────────────────────────────────

-- 7a. Generic updated_at trigger
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_breeders_updated_at
    BEFORE UPDATE ON breeders FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_reviews_updated_at
    BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_svc_reviews_updated_at
    BEFORE UPDATE ON service_reviews FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_threads_updated_at
    BEFORE UPDATE ON threads FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 7b. Breeder search_vector maintenance
CREATE OR REPLACE FUNCTION fn_breeder_search_vector()
RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('portuguese', coalesce(NEW.business_name, '')), 'A') ||
        setweight(to_tsvector('portuguese', coalesce(NEW.description, '')),   'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_breeder_search_vector
    BEFORE INSERT OR UPDATE OF business_name, description ON breeders
    FOR EACH ROW EXECUTE FUNCTION fn_breeder_search_vector();

-- 7c. Service search_vector maintenance
CREATE OR REPLACE FUNCTION fn_service_search_vector()
RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('portuguese', coalesce(NEW.title, '')),       'A') ||
        setweight(to_tsvector('portuguese', coalesce(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_service_search_vector
    BEFORE INSERT OR UPDATE OF title, description ON services
    FOR EACH ROW EXECUTE FUNCTION fn_service_search_vector();

-- 7d. Breeder rating aggregation (fires on review INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION fn_sync_breeder_rating()
RETURNS trigger AS $$
DECLARE
    _breeder_id INT;
BEGIN
    _breeder_id := coalesce(NEW.breeder_id, OLD.breeder_id);

    UPDATE breeders
    SET avg_rating = coalesce((
            SELECT round(avg(rating)::numeric, 2)
            FROM   reviews
            WHERE  breeder_id = _breeder_id AND status = 'PUBLISHED'
        ), 0),
        review_count = (
            SELECT count(*)
            FROM   reviews
            WHERE  breeder_id = _breeder_id AND status = 'PUBLISHED'
        )
    WHERE id = _breeder_id;

    RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_rating_sync
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION fn_sync_breeder_rating();

-- 7e. Service rating aggregation
CREATE OR REPLACE FUNCTION fn_sync_service_rating()
RETURNS trigger AS $$
DECLARE
    _service_id INT;
BEGIN
    _service_id := coalesce(NEW.service_id, OLD.service_id);

    UPDATE services
    SET avg_rating = coalesce((
            SELECT round(avg(rating)::numeric, 2)
            FROM   service_reviews
            WHERE  service_id = _service_id AND status = 'PUBLISHED'
        ), 0),
        review_count = (
            SELECT count(*)
            FROM   service_reviews
            WHERE  service_id = _service_id AND status = 'PUBLISHED'
        )
    WHERE id = _service_id;

    RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_svc_review_rating_sync
    AFTER INSERT OR UPDATE OR DELETE ON service_reviews
    FOR EACH ROW EXECUTE FUNCTION fn_sync_service_rating();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Seed data — reference tables
-- ────────────────────────────────────────────────────────────────────────────

-- 8a. Roles
INSERT INTO roles (name, description) VALUES
    ('OWNER',            'Dono de animal — perfil base'),
    ('BREEDER',          'Criador verificado'),
    ('SERVICE_PROVIDER', 'Prestador de serviços (v1.1)'),
    ('ADMIN',            'Administrador da plataforma');

-- 8b. Species (MVP set — 12 canonical species)
INSERT INTO species (name_slug, name_pt) VALUES
    ('cao',                'Cão'),
    ('gato',               'Gato'),
    ('coelho',             'Coelho'),
    ('hamster',            'Hamster'),
    ('porquinho-da-india', 'Porquinho-da-índia'),
    ('chinchila',          'Chinchila'),
    ('furao',              'Furão'),
    ('ave',                'Ave'),
    ('reptil',             'Réptil'),
    ('peixe',              'Peixe'),
    ('cavalo',             'Cavalo'),
    ('outro',              'Outro');

-- 8c. Service categories (v1.1 seed)
INSERT INTO service_categories (name_slug, name_pt) VALUES
    ('veterinario',   'Veterinário'),
    ('tosquia',       'Tosquia / Grooming'),
    ('treino',        'Treino / Comportamento'),
    ('pet-sitting',   'Pet Sitting'),
    ('passeio',       'Passeio de Cães'),
    ('transporte',    'Transporte de Animais'),
    ('fotografia',    'Fotografia Animal'),
    ('outro',         'Outro');

-- 8d. Districts (18 continental + 2 autonomous regions)
INSERT INTO districts (code, name_pt) VALUES
    ('01', 'Aveiro'),
    ('02', 'Beja'),
    ('03', 'Braga'),
    ('04', 'Bragança'),
    ('05', 'Castelo Branco'),
    ('06', 'Coimbra'),
    ('07', 'Évora'),
    ('08', 'Faro'),
    ('09', 'Guarda'),
    ('10', 'Leiria'),
    ('11', 'Lisboa'),
    ('12', 'Portalegre'),
    ('13', 'Porto'),
    ('14', 'Santarém'),
    ('15', 'Setúbal'),
    ('16', 'Viana do Castelo'),
    ('17', 'Vila Real'),
    ('18', 'Viseu'),
    ('31', 'Região Autónoma dos Açores'),
    ('32', 'Região Autónoma da Madeira');

COMMIT;
