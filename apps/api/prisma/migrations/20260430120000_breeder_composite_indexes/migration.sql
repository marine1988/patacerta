-- Indexes compostos em Breeder para hot-paths publicos.
-- Endpoints search/map/home featured filtram sempre por status='VERIFIED'
-- combinado com districtId/municipalityId/featuredUntil. Um btree composto
-- e' mais eficiente que bitmap-and de 2 indexes separados. Alinha com
-- pattern ja usado em Service (status, category_id) etc.

CREATE INDEX IF NOT EXISTS "breeders_status_district_id_idx" ON "breeders"("status", "district_id");
CREATE INDEX IF NOT EXISTS "breeders_status_municipality_id_idx" ON "breeders"("status", "municipality_id");
CREATE INDEX IF NOT EXISTS "breeders_status_featured_until_idx" ON "breeders"("status", "featured_until");
