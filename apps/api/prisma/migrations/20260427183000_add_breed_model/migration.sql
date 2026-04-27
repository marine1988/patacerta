-- CreateTable
CREATE TABLE "breeds" (
    "id" SERIAL NOT NULL,
    "species_id" INTEGER NOT NULL,
    "name_slug" VARCHAR(80) NOT NULL,
    "name_pt" VARCHAR(120) NOT NULL,
    "fci_group" VARCHAR(80),
    "origin" VARCHAR(120),
    "summary_pt" VARCHAR(500) NOT NULL,
    "size" VARCHAR(10) NOT NULL,
    "weight_min_kg" DOUBLE PRECISION NOT NULL,
    "weight_max_kg" DOUBLE PRECISION NOT NULL,
    "lifespan_min_yrs" INTEGER NOT NULL,
    "lifespan_max_yrs" INTEGER NOT NULL,
    "coat_length" VARCHAR(10) NOT NULL,
    "shedding" INTEGER NOT NULL,
    "hypoallergenic" BOOLEAN NOT NULL DEFAULT false,
    "energy_level" INTEGER NOT NULL,
    "exercise_daily_min" INTEGER NOT NULL,
    "trainability" INTEGER NOT NULL,
    "bark_level" VARCHAR(10) NOT NULL,
    "grooming_level" INTEGER NOT NULL,
    "good_with_kids" INTEGER NOT NULL,
    "good_with_dogs" INTEGER NOT NULL,
    "good_with_strangers" INTEGER NOT NULL,
    "apartment_friendly" BOOLEAN NOT NULL DEFAULT false,
    "novice_friendly" BOOLEAN NOT NULL DEFAULT false,
    "tolerates_alone" INTEGER NOT NULL,
    "cold_tolerance" INTEGER NOT NULL,
    "heat_tolerance" INTEGER NOT NULL,
    "image_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "breeds_name_slug_key" ON "breeds"("name_slug");

-- CreateIndex
CREATE INDEX "breeds_species_id_idx" ON "breeds"("species_id");

-- CreateIndex
CREATE INDEX "breeds_size_idx" ON "breeds"("size");

-- AddForeignKey
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;
