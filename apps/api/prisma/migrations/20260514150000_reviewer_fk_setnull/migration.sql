-- Fix cascade behaviour for "reviewer" FKs that previously had no ON DELETE
-- declared. In Postgres the default is NO ACTION, which means deleting a user
-- that ever moderated a verification doc / message report / service report
-- raises a FK violation and aborts the entire DELETE — including the cascade
-- chain triggered by `User onDelete: Cascade` on Breeder, Thread, etc.
--
-- The reviewer (admin) is metadata, not ownership: when the admin user is
-- removed, the historical moderation record should remain (RGPD audit trail),
-- but the reviewedBy pointer becomes NULL. This mirrors the AuditLog.userId
-- pattern, which already uses SetNull for the same reason.
--
-- Prisma standard FK constraint names: <table>_<column>_fkey.

ALTER TABLE "verification_docs"
  DROP CONSTRAINT IF EXISTS "verification_docs_reviewed_by_fkey",
  ADD CONSTRAINT "verification_docs_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_reports"
  DROP CONSTRAINT IF EXISTS "message_reports_reviewed_by_fkey",
  ADD CONSTRAINT "message_reports_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_reports"
  DROP CONSTRAINT IF EXISTS "service_reports_reviewed_by_fkey",
  ADD CONSTRAINT "service_reports_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
