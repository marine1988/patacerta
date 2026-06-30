-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'BREEDER', 'SERVICE_PROVIDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BreederStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('NIF', 'DGAV', 'CARTAO_CIDADAO', 'CITES', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'FLAGGED');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('FIXED', 'HOURLY', 'PER_SESSION');

-- CreateEnum
CREATE TYPE "ServiceReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SponsoredBreedSlotStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SponsoredSlotPaymentStatus" AS ENUM ('LEGACY', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "MessageReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "phone" VARCHAR(20),
    "avatar_url" VARCHAR(512),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" VARCHAR(500),
    "reset_token" VARCHAR(64),
    "reset_token_expires_at" TIMESTAMP(3),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" VARCHAR(64),
    "email_verification_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeders" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "business_name" VARCHAR(200) NOT NULL,
    "nif" VARCHAR(9) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "dgav_number" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "website" VARCHAR(255),
    "phone" VARCHAR(20),
    "status" "BreederStatus" NOT NULL DEFAULT 'DRAFT',
    "verified_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" VARCHAR(500),
    "featured_until" TIMESTAMP(3),
    "district_id" INTEGER NOT NULL,
    "municipality_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "youtube_video_id" VARCHAR(20),
    "cpc_member" BOOLEAN NOT NULL DEFAULT false,
    "fci_affiliated" BOOLEAN NOT NULL DEFAULT false,
    "incl_vet_checkup" BOOLEAN NOT NULL DEFAULT false,
    "incl_microchip" BOOLEAN NOT NULL DEFAULT false,
    "incl_vaccinations" BOOLEAN NOT NULL DEFAULT false,
    "incl_lop" BOOLEAN NOT NULL DEFAULT false,
    "incl_kennel_name" BOOLEAN NOT NULL DEFAULT false,
    "incl_sales_invoice" BOOLEAN NOT NULL DEFAULT false,
    "incl_food" BOOLEAN NOT NULL DEFAULT false,
    "incl_initial_training" BOOLEAN NOT NULL DEFAULT false,
    "pickup_in_person" BOOLEAN NOT NULL DEFAULT true,
    "delivery_by_car" BOOLEAN NOT NULL DEFAULT false,
    "delivery_by_plane" BOOLEAN NOT NULL DEFAULT false,
    "pickup_notes" TEXT,
    "other_breeds_note" VARCHAR(500),
    "avg_rating" DOUBLE PRECISION,
    "review_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "breeders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "species" (
    "id" SERIAL NOT NULL,
    "name_slug" VARCHAR(50) NOT NULL,
    "name_pt" VARCHAR(100) NOT NULL,

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "breeder_breeds" (
    "breeder_id" INTEGER NOT NULL,
    "breed_id" INTEGER NOT NULL,

    CONSTRAINT "breeder_breeds_pkey" PRIMARY KEY ("breeder_id","breed_id")
);

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
    "payment_status" "SponsoredSlotPaymentStatus" NOT NULL DEFAULT 'LEGACY',
    "price_cents" INTEGER,
    "currency" VARCHAR(3) DEFAULT 'EUR',
    "stripe_checkout_session_id" VARCHAR(255),
    "stripe_payment_intent_id" VARCHAR(255),
    "stripe_receipt_url" VARCHAR(512),
    "paid_at" TIMESTAMP(3),
    "paid_by_user_id" INTEGER,

    CONSTRAINT "sponsored_breed_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeder_species" (
    "breeder_id" INTEGER NOT NULL,
    "species_id" INTEGER NOT NULL,

    CONSTRAINT "breeder_species_pkey" PRIMARY KEY ("breeder_id","species_id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "name_pt" VARCHAR(100) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipalities" (
    "id" SERIAL NOT NULL,
    "district_id" INTEGER NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name_pt" VARCHAR(100) NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_docs" (
    "id" SERIAL NOT NULL,
    "breeder_id" INTEGER NOT NULL,
    "doc_type" "DocType" NOT NULL,
    "file_url" VARCHAR(512) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "breeder_id" INTEGER,
    "service_id" INTEGER,
    "subject" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_by_owner_at" TIMESTAMP(3),
    "archived_by_breeder_at" TIMESTAMP(3),

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "thread_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reports" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "MessageReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "resolution" VARCHAR(500),

    CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "breeder_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "rating" SMALLINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "moderation_reason" TEXT,
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_flags" (
    "id" SERIAL NOT NULL,
    "review_id" INTEGER NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_reviews" (
    "id" SERIAL NOT NULL,
    "service_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "rating" SMALLINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "moderation_reason" TEXT,
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_review_flags" (
    "id" SERIAL NOT NULL,
    "review_id" INTEGER NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_review_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(50) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" INTEGER,
    "details" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "consent_type" VARCHAR(50) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookie_consent_logs" (
    "id" SERIAL NOT NULL,
    "anon_id" UUID NOT NULL,
    "user_id" INTEGER,
    "decision" JSONB NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cookie_consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" SERIAL NOT NULL,
    "name_slug" VARCHAR(50) NOT NULL,
    "name_pt" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "provider_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "price_unit" "PriceUnit" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "district_id" INTEGER NOT NULL,
    "municipality_id" INTEGER NOT NULL,
    "address_line" VARCHAR(255),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocoded_at" TIMESTAMP(3),
    "geocode_source" VARCHAR(20),
    "service_radius_km" INTEGER,
    "status" "ServiceStatus" NOT NULL DEFAULT 'DRAFT',
    "website" VARCHAR(255),
    "phone" VARCHAR(20),
    "avg_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "removed_reason" VARCHAR(500),
    "featured_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_photos" (
    "id" SERIAL NOT NULL,
    "service_id" INTEGER NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeder_photos" (
    "id" SERIAL NOT NULL,
    "breeder_id" INTEGER NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "caption" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breeder_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_coverage" (
    "service_id" INTEGER NOT NULL,
    "municipality_id" INTEGER NOT NULL,

    CONSTRAINT "service_coverage_pkey" PRIMARY KEY ("service_id","municipality_id")
);

-- CreateTable
CREATE TABLE "service_reports" (
    "id" SERIAL NOT NULL,
    "service_id" INTEGER NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "ServiceReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "resolution" VARCHAR(500),

    CONSTRAINT "service_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_verification_token_key" ON "users"("email_verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "breeders_user_id_key" ON "breeders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "breeders_nif_key" ON "breeders"("nif");

-- CreateIndex
CREATE UNIQUE INDEX "breeders_slug_key" ON "breeders"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "breeders_dgav_number_key" ON "breeders"("dgav_number");

-- CreateIndex
CREATE INDEX "breeders_district_id_idx" ON "breeders"("district_id");

-- CreateIndex
CREATE INDEX "breeders_status_idx" ON "breeders"("status");

-- CreateIndex
CREATE INDEX "breeders_nif_idx" ON "breeders"("nif");

-- CreateIndex
CREATE INDEX "breeders_dgav_number_idx" ON "breeders"("dgav_number");

-- CreateIndex
CREATE INDEX "breeders_featured_until_idx" ON "breeders"("featured_until");

-- CreateIndex
CREATE INDEX "breeders_status_district_id_idx" ON "breeders"("status", "district_id");

-- CreateIndex
CREATE INDEX "breeders_status_municipality_id_idx" ON "breeders"("status", "municipality_id");

-- CreateIndex
CREATE INDEX "breeders_status_featured_until_idx" ON "breeders"("status", "featured_until");

-- CreateIndex
CREATE INDEX "breeders_status_created_at_idx" ON "breeders"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "breeders_status_avg_rating_idx" ON "breeders"("status", "avg_rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "species_name_slug_key" ON "species"("name_slug");

-- CreateIndex
CREATE UNIQUE INDEX "breeds_name_slug_key" ON "breeds"("name_slug");

-- CreateIndex
CREATE INDEX "breeds_species_id_idx" ON "breeds"("species_id");

-- CreateIndex
CREATE INDEX "breeds_size_idx" ON "breeds"("size");

-- CreateIndex
CREATE INDEX "breeder_breeds_breed_id_idx" ON "breeder_breeds"("breed_id");

-- CreateIndex
CREATE UNIQUE INDEX "sponsored_breed_slots_stripe_checkout_session_id_key" ON "sponsored_breed_slots"("stripe_checkout_session_id");

-- CreateIndex
CREATE INDEX "sponsored_breed_slots_breed_id_status_starts_at_ends_at_idx" ON "sponsored_breed_slots"("breed_id", "status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "sponsored_breed_slots_breeder_id_idx" ON "sponsored_breed_slots"("breeder_id");

-- CreateIndex
CREATE INDEX "sponsored_breed_slots_payment_status_idx" ON "sponsored_breed_slots"("payment_status");

-- CreateIndex
CREATE INDEX "stripe_events_type_idx" ON "stripe_events"("type");

-- CreateIndex
CREATE INDEX "stripe_events_processed_at_idx" ON "stripe_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_code_key" ON "municipalities"("code");

-- CreateIndex
CREATE INDEX "municipalities_district_id_idx" ON "municipalities"("district_id");

-- CreateIndex
CREATE INDEX "verification_docs_breeder_id_idx" ON "verification_docs"("breeder_id");

-- CreateIndex
CREATE INDEX "verification_docs_status_idx" ON "verification_docs"("status");

-- CreateIndex
CREATE INDEX "verification_docs_breeder_id_doc_type_idx" ON "verification_docs"("breeder_id", "doc_type");

-- CreateIndex
CREATE INDEX "threads_owner_id_idx" ON "threads"("owner_id");

-- CreateIndex
CREATE INDEX "threads_breeder_id_idx" ON "threads"("breeder_id");

-- CreateIndex
CREATE INDEX "threads_service_id_idx" ON "threads"("service_id");

-- CreateIndex
CREATE INDEX "threads_updated_at_idx" ON "threads"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "threads_owner_id_breeder_id_key" ON "threads"("owner_id", "breeder_id");

-- CreateIndex
CREATE UNIQUE INDEX "threads_owner_id_service_id_key" ON "threads"("owner_id", "service_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_idx" ON "messages"("thread_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_thread_id_sender_id_read_at_idx" ON "messages"("thread_id", "sender_id", "read_at");

-- CreateIndex
CREATE INDEX "message_reports_message_id_idx" ON "message_reports"("message_id");

-- CreateIndex
CREATE INDEX "message_reports_reporter_id_idx" ON "message_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "message_reports_status_idx" ON "message_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "message_reports_message_id_reporter_id_status_key" ON "message_reports"("message_id", "reporter_id", "status");

-- CreateIndex
CREATE INDEX "reviews_breeder_id_idx" ON "reviews"("breeder_id");

-- CreateIndex
CREATE INDEX "reviews_author_id_idx" ON "reviews"("author_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "reviews_breeder_id_status_created_at_idx" ON "reviews"("breeder_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_breeder_id_author_id_key" ON "reviews"("breeder_id", "author_id");

-- CreateIndex
CREATE INDEX "review_flags_review_id_idx" ON "review_flags"("review_id");

-- CreateIndex
CREATE INDEX "review_flags_reporter_id_idx" ON "review_flags"("reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_flags_review_id_reporter_id_key" ON "review_flags"("review_id", "reporter_id");

-- CreateIndex
CREATE INDEX "service_reviews_service_id_idx" ON "service_reviews"("service_id");

-- CreateIndex
CREATE INDEX "service_reviews_author_id_idx" ON "service_reviews"("author_id");

-- CreateIndex
CREATE INDEX "service_reviews_status_idx" ON "service_reviews"("status");

-- CreateIndex
CREATE INDEX "service_reviews_service_id_status_created_at_idx" ON "service_reviews"("service_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_reviews_service_id_author_id_key" ON "service_reviews"("service_id", "author_id");

-- CreateIndex
CREATE INDEX "service_review_flags_review_id_idx" ON "service_review_flags"("review_id");

-- CreateIndex
CREATE INDEX "service_review_flags_reporter_id_idx" ON "service_review_flags"("reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_review_flags_review_id_reporter_id_key" ON "service_review_flags"("review_id", "reporter_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "consent_logs_user_id_idx" ON "consent_logs"("user_id");

-- CreateIndex
CREATE INDEX "consent_logs_consent_type_idx" ON "consent_logs"("consent_type");

-- CreateIndex
CREATE INDEX "cookie_consent_logs_anon_id_idx" ON "cookie_consent_logs"("anon_id");

-- CreateIndex
CREATE INDEX "cookie_consent_logs_user_id_idx" ON "cookie_consent_logs"("user_id");

-- CreateIndex
CREATE INDEX "cookie_consent_logs_created_at_idx" ON "cookie_consent_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "cookie_consent_logs_anon_id_created_at_idx" ON "cookie_consent_logs"("anon_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_name_slug_key" ON "service_categories"("name_slug");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "services_provider_id_idx" ON "services"("provider_id");

-- CreateIndex
CREATE INDEX "services_category_id_idx" ON "services"("category_id");

-- CreateIndex
CREATE INDEX "services_district_id_idx" ON "services"("district_id");

-- CreateIndex
CREATE INDEX "services_status_idx" ON "services"("status");

-- CreateIndex
CREATE INDEX "services_status_category_id_idx" ON "services"("status", "category_id");

-- CreateIndex
CREATE INDEX "services_status_category_id_district_id_idx" ON "services"("status", "category_id", "district_id");

-- CreateIndex
CREATE INDEX "services_status_published_at_idx" ON "services"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "services_status_price_cents_idx" ON "services"("status", "price_cents");

-- CreateIndex
CREATE INDEX "services_status_avg_rating_idx" ON "services"("status", "avg_rating" DESC);

-- CreateIndex
CREATE INDEX "services_status_municipality_id_idx" ON "services"("status", "municipality_id");

-- CreateIndex
CREATE INDEX "services_status_latitude_longitude_idx" ON "services"("status", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "services_provider_id_updated_at_idx" ON "services"("provider_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "services_featured_until_idx" ON "services"("featured_until");

-- CreateIndex
CREATE INDEX "services_status_featured_until_idx" ON "services"("status", "featured_until");

-- CreateIndex
CREATE INDEX "service_photos_service_id_sort_order_idx" ON "service_photos"("service_id", "sort_order");

-- CreateIndex
CREATE INDEX "breeder_photos_breeder_id_sort_order_idx" ON "breeder_photos"("breeder_id", "sort_order");

-- CreateIndex
CREATE INDEX "service_coverage_municipality_id_idx" ON "service_coverage"("municipality_id");

-- CreateIndex
CREATE INDEX "service_reports_service_id_idx" ON "service_reports"("service_id");

-- CreateIndex
CREATE INDEX "service_reports_reporter_id_idx" ON "service_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "service_reports_status_idx" ON "service_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "service_reports_service_id_reporter_id_status_key" ON "service_reports"("service_id", "reporter_id", "status");

-- AddForeignKey
ALTER TABLE "breeders" ADD CONSTRAINT "breeders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeders" ADD CONSTRAINT "breeders_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeders" ADD CONSTRAINT "breeders_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_breeds" ADD CONSTRAINT "breeder_breeds_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_breeds" ADD CONSTRAINT "breeder_breeds_breed_id_fkey" FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_breed_slots" ADD CONSTRAINT "sponsored_breed_slots_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_breed_slots" ADD CONSTRAINT "sponsored_breed_slots_breed_id_fkey" FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_breed_slots" ADD CONSTRAINT "sponsored_breed_slots_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_species" ADD CONSTRAINT "breeder_species_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_species" ADD CONSTRAINT "breeder_species_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_docs" ADD CONSTRAINT "verification_docs_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_docs" ADD CONSTRAINT "verification_docs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_review_flags" ADD CONSTRAINT "service_review_flags_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "service_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_review_flags" ADD CONSTRAINT "service_review_flags_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cookie_consent_logs" ADD CONSTRAINT "cookie_consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_photos" ADD CONSTRAINT "service_photos_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_photos" ADD CONSTRAINT "breeder_photos_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "breeders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_coverage" ADD CONSTRAINT "service_coverage_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_coverage" ADD CONSTRAINT "service_coverage_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

