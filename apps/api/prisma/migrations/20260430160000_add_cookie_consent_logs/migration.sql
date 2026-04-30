-- Cookie consent logs (CMP). Distinto de `consent_logs` (que regista
-- aceitacao de Termos/Privacidade no signup, sempre ligado a um userId).
-- Esta tabela guarda decisoes do banner de cookies, anonimas ou ligadas
-- a utilizador. Audit trail para CNPD/RGPD.
--
-- - anon_id: UUID gerado client-side e persistido em localStorage.
--   Permite ligar varias decisoes do mesmo browser sem identificar
--   pessoa. Apagavel pelo utilizador.
-- - user_id: nullable. Preenchido quando ha sessao iniciada.
-- - decision: jsonb com { necessary: true, analytics: bool, marketing: bool }
-- - version: identifica a versao da politica de cookies (incrementar
--   quando categorias mudam, exige re-consent).

CREATE TABLE IF NOT EXISTS "cookie_consent_logs" (
  "id"          SERIAL PRIMARY KEY,
  "anon_id"     UUID NOT NULL,
  "user_id"     INTEGER,
  "decision"    JSONB NOT NULL,
  "version"     VARCHAR(20) NOT NULL,
  "ip_address"  VARCHAR(45),
  "user_agent"  VARCHAR(500),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cookie_consent_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "cookie_consent_logs_anon_id_idx"
  ON "cookie_consent_logs" ("anon_id");

CREATE INDEX IF NOT EXISTS "cookie_consent_logs_user_id_idx"
  ON "cookie_consent_logs" ("user_id");

CREATE INDEX IF NOT EXISTS "cookie_consent_logs_created_at_idx"
  ON "cookie_consent_logs" ("created_at" DESC);
