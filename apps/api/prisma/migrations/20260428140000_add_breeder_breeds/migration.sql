-- Adiciona campo otherBreedsNote em breeders (texto livre para "Outras racas")
ALTER TABLE "breeders" ADD COLUMN "other_breeds_note" VARCHAR(500);

-- Junction table BreederBreed (many-to-many entre Breeder e Breed)
CREATE TABLE "breeder_breeds" (
    "breeder_id" INTEGER NOT NULL,
    "breed_id" INTEGER NOT NULL,
    CONSTRAINT "breeder_breeds_pkey" PRIMARY KEY ("breeder_id", "breed_id")
);

CREATE INDEX "breeder_breeds_breed_id_idx" ON "breeder_breeds"("breed_id");

ALTER TABLE "breeder_breeds"
    ADD CONSTRAINT "breeder_breeds_breeder_id_fkey"
    FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breeder_breeds"
    ADD CONSTRAINT "breeder_breeds_breed_id_fkey"
    FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
