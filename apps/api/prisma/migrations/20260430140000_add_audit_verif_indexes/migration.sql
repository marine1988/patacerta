-- Indexes adicionais para queries de hot-path nas entidades de auditoria
-- e verificacao DGAV.
--
-- 1) audit_logs (action, created_at DESC):
--    Dashboards de admin filtram por `action` (ex.: 'MESSAGE_REPORTED',
--    'BREEDER_VERIFIED') ordenados por data desc. O index existente em
--    `created_at` apenas serve range scans globais; o composto evita
--    bitmap-and entre dois indexes separados.
--
-- 2) verification_docs (breeder_id, doc_type):
--    Lookup tipico no painel admin: "ver documentos do tipo X submetidos
--    pelo criador Y". O index em (breeder_id) sozinho ja' filtra mas o
--    composto evita filtragem em memoria de >100 docs por criador no
--    caso de re-submissoes.

CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx"
  ON "audit_logs" ("action", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "verification_docs_breeder_id_doc_type_idx"
  ON "verification_docs" ("breeder_id", "doc_type");
