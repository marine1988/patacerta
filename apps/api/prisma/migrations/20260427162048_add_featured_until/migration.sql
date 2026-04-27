-- Add featured_until columns + indexes to enable homepage featured carousels.
-- Promotion is admin-controlled (no payment yet); a row is "featured" when
-- featured_until > now(). NULL means not promoted.

ALTER TABLE breeders ADD COLUMN featured_until TIMESTAMPTZ;
ALTER TABLE services ADD COLUMN featured_until TIMESTAMPTZ;

CREATE INDEX breeders_featured_until_idx ON breeders (featured_until);
CREATE INDEX services_featured_until_idx ON services (featured_until);
