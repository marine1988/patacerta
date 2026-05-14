-- Dedupe pre-existing duplicate (message_id, reporter_id, status) tuples
-- before adding the unique constraint. Keep the oldest report per tuple
-- (lowest id); cascade-delete the rest. This matches the prior
-- findFirst-then-create semantics in reportMessage (which silently
-- returned the existing PENDING and never created a duplicate normally,
-- but raced under concurrency could).
DELETE FROM "message_reports" a
USING "message_reports" b
WHERE a."message_id" = b."message_id"
  AND a."reporter_id" = b."reporter_id"
  AND a."status" = b."status"
  AND a."id" > b."id";

-- Add unique constraint to enforce one report per (message, reporter, status)
-- at the database layer. Mirrors the `service_report_dedupe` pattern.
CREATE UNIQUE INDEX "message_reports_message_id_reporter_id_status_key"
  ON "message_reports" ("message_id", "reporter_id", "status");
