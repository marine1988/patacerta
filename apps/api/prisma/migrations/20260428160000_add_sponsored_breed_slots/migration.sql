-- CreateEnum
CREATE TYPE "SponsoredBreedSlotStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "sponsored_breed_slots" (
    "id" SERIAL NOT NULL,
    "breeder_id" INTEGER NOT NULL,
    "breed_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "SponsoredBreedSlotStatus" NOT NULL DEFAULT 'ACTIVE',
    "impression_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_breed_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsored_breed_slots_breed_id_status_starts_at_ends_at_idx" ON "sponsored_breed_slots"("breed_id", "status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "sponsored_breed_slots_breeder_id_idx" ON "sponsored_breed_slots"("breeder_id");

-- AddForeignKey
ALTER TABLE "sponsored_breed_slots" ADD CONSTRAINT "sponsored_breed_slots_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_breed_slots" ADD CONSTRAINT "sponsored_breed_slots_breed_id_fkey" FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
