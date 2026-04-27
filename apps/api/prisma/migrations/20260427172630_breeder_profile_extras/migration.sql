-- Adicionar campos de apresentacao publica e tabela de fotos do criador.

ALTER TABLE "breeders"
  ADD COLUMN "youtube_video_id" VARCHAR(20),
  ADD COLUMN "cpc_member" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fci_affiliated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_vet_checkup" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_microchip" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_vaccinations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_lop" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_kennel_name" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_sales_invoice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_food" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incl_initial_training" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pickup_in_person" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "delivery_by_car" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "delivery_by_plane" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pickup_notes" TEXT;

CREATE TABLE "breeder_photos" (
  "id" SERIAL PRIMARY KEY,
  "breeder_id" INTEGER NOT NULL,
  "url" VARCHAR(512) NOT NULL,
  "caption" VARCHAR(200),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "breeder_photos_breeder_id_fkey" FOREIGN KEY ("breeder_id")
    REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "breeder_photos_breeder_id_sort_order_idx"
  ON "breeder_photos"("breeder_id", "sort_order");
