-- Additive schema support for the Multi-Layer Hybrid Concert Intelligence System.

CREATE TYPE "EventValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED', 'REVIEW_REQUIRED', 'DUPLICATE');
CREATE TYPE "DuplicateGroupStatus" AS ENUM ('OPEN', 'MERGED', 'DISMISSED');
CREATE TYPE "DuplicateMemberRole" AS ENUM ('CANONICAL', 'DUPLICATE', 'CANDIDATE');

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'CONCERT_SCRAPE';

CREATE TABLE "canonical_events" (
    "id" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "normalizedArtistName" TEXT NOT NULL,
    "eventName" TEXT,
    "venueName" TEXT NOT NULL,
    "normalizedVenueName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "normalizedCity" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "ticketPriceRange" JSONB,
    "confidenceScore" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "fraudRiskScore" DECIMAL(5,4),
    "validationStatus" "EventValidationStatus" NOT NULL DEFAULT 'PENDING',
    "canonicalKey" TEXT NOT NULL,
    "embedding" JSONB,
    "rawPayload" JSONB,
    "concertId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_event_references" (
    "id" TEXT NOT NULL,
    "canonicalEventId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "sourceUrl" TEXT,
    "sourceEventKey" TEXT NOT NULL,
    "rawPayload" JSONB,
    "confidenceScore" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_event_references_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "duplicate_groups" (
    "id" TEXT NOT NULL,
    "canonicalEventId" TEXT,
    "status" "DuplicateGroupStatus" NOT NULL DEFAULT 'OPEN',
    "similarityScore" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duplicate_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "duplicate_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "canonicalEventId" TEXT NOT NULL,
    "role" "DuplicateMemberRole" NOT NULL DEFAULT 'CANDIDATE',
    "similarityScore" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "reasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_group_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "validation_logs" (
    "id" TEXT NOT NULL,
    "canonicalEventId" TEXT,
    "concertId" TEXT,
    "sourcePlatform" TEXT,
    "confidenceScore" DECIMAL(5,4) NOT NULL,
    "fraudRiskScore" DECIMAL(5,4) NOT NULL,
    "validationStatus" "EventValidationStatus" NOT NULL,
    "validationReasons" JSONB NOT NULL,
    "ruleScores" JSONB,
    "mlSignals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prediction_outputs" (
    "id" TEXT NOT NULL,
    "canonicalEventId" TEXT,
    "concertId" TEXT,
    "modelVersion" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "expectedRevenue" DECIMAL(14,2) NOT NULL,
    "expectedAttendance" INTEGER NOT NULL,
    "selloutProbability" DECIMAL(5,4) NOT NULL,
    "demandScore" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_outputs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feature_snapshots" (
    "id" TEXT NOT NULL,
    "canonicalEventId" TEXT,
    "artistId" TEXT,
    "concertId" TEXT,
    "featureSetVersion" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canonical_events_canonicalKey_key" ON "canonical_events"("canonicalKey");
CREATE INDEX "canonical_events_normalizedArtistName_eventDate_idx" ON "canonical_events"("normalizedArtistName", "eventDate");
CREATE INDEX "canonical_events_normalizedVenueName_normalizedCity_eventDate_idx" ON "canonical_events"("normalizedVenueName", "normalizedCity", "eventDate");
CREATE INDEX "canonical_events_validationStatus_idx" ON "canonical_events"("validationStatus");
CREATE INDEX "canonical_events_sourcePlatform_idx" ON "canonical_events"("sourcePlatform");

CREATE UNIQUE INDEX "source_event_references_sourceEventKey_key" ON "source_event_references"("sourceEventKey");
CREATE INDEX "source_event_references_canonicalEventId_idx" ON "source_event_references"("canonicalEventId");
CREATE INDEX "source_event_references_sourcePlatform_idx" ON "source_event_references"("sourcePlatform");

CREATE INDEX "duplicate_groups_canonicalEventId_idx" ON "duplicate_groups"("canonicalEventId");
CREATE INDEX "duplicate_groups_status_idx" ON "duplicate_groups"("status");
CREATE UNIQUE INDEX "duplicate_group_members_groupId_canonicalEventId_key" ON "duplicate_group_members"("groupId", "canonicalEventId");
CREATE INDEX "duplicate_group_members_canonicalEventId_idx" ON "duplicate_group_members"("canonicalEventId");

CREATE INDEX "validation_logs_canonicalEventId_idx" ON "validation_logs"("canonicalEventId");
CREATE INDEX "validation_logs_concertId_idx" ON "validation_logs"("concertId");
CREATE INDEX "validation_logs_validationStatus_idx" ON "validation_logs"("validationStatus");

CREATE INDEX "prediction_outputs_canonicalEventId_idx" ON "prediction_outputs"("canonicalEventId");
CREATE INDEX "prediction_outputs_concertId_idx" ON "prediction_outputs"("concertId");
CREATE INDEX "prediction_outputs_modelVersion_idx" ON "prediction_outputs"("modelVersion");

CREATE INDEX "feature_snapshots_canonicalEventId_idx" ON "feature_snapshots"("canonicalEventId");
CREATE INDEX "feature_snapshots_artistId_idx" ON "feature_snapshots"("artistId");
CREATE INDEX "feature_snapshots_concertId_idx" ON "feature_snapshots"("concertId");
CREATE INDEX "feature_snapshots_featureSetVersion_idx" ON "feature_snapshots"("featureSetVersion");

ALTER TABLE "canonical_events" ADD CONSTRAINT "canonical_events_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "concerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_event_references" ADD CONSTRAINT "source_event_references_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "canonical_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duplicate_groups" ADD CONSTRAINT "duplicate_groups_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "canonical_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "duplicate_group_members" ADD CONSTRAINT "duplicate_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "duplicate_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duplicate_group_members" ADD CONSTRAINT "duplicate_group_members_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "canonical_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validation_logs" ADD CONSTRAINT "validation_logs_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "canonical_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "validation_logs" ADD CONSTRAINT "validation_logs_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "concerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prediction_outputs" ADD CONSTRAINT "prediction_outputs_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "canonical_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prediction_outputs" ADD CONSTRAINT "prediction_outputs_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "concerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "canonical_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "concerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
