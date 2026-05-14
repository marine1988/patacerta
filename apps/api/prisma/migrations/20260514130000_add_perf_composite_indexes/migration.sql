-- Composite indexes para hot-paths identificados na auditoria de schema.
-- Todos non-blocking (CREATE INDEX, nao UNIQUE), seguros para apply em prod.
--
-- Breeder: search.controller filtra por status='VERIFIED' e ordena por
-- createdAt desc ou avgRating desc. Sem composto, o planner sortava
-- apos filter — caro com volume de criadores.
CREATE INDEX IF NOT EXISTS "breeders_status_created_at_idx"
  ON "breeders" ("status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "breeders_status_avg_rating_idx"
  ON "breeders" ("status", "avg_rating" DESC);

-- Service: home featured filtra status='ACTIVE' AND featured_until > now().
-- Espelha o que Breeder ja tem.
CREATE INDEX IF NOT EXISTS "services_status_featured_until_idx"
  ON "services" ("status", "featured_until");

-- AuditLog: views "actividade do utilizador" no admin filtram por userId
-- e ordenam por createdAt desc.
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx"
  ON "audit_logs" ("user_id", "created_at" DESC);

-- CookieConsentLog: "ultima decisao para este anonId" — anonId+createdAt
-- desc evita sort apos filter.
CREATE INDEX IF NOT EXISTS "cookie_consent_logs_anon_id_created_at_idx"
  ON "cookie_consent_logs" ("anon_id", "created_at" DESC);
