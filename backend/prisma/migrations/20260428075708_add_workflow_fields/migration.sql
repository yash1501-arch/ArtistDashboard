-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TWITTER', 'YOUTUBE', 'SPOTIFY', 'APPLE_MUSIC', 'REDDIT', 'QUORA');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('API', 'EXCEL_IMPORT');

-- CreateEnum
CREATE TYPE "DemographicDimension" AS ENUM ('AGE_GROUP', 'GENDER', 'GEOGRAPHY', 'GENRE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "displayName" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "genre" TEXT,
    "nationality" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "wikiUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "twitterUrl" TEXT,
    "spotifyUrl" TEXT,
    "youtubeUrl" TEXT,
    "appleMusicUrl" TEXT,
    "instagramFollowers" BIGINT,
    "facebookFollowers" BIGINT,
    "twitterFollowers" BIGINT,
    "spotifyMonthlyListeners" BIGINT,
    "youtubeSubscribers" BIGINT,
    "appleMusicListeners" BIGINT,
    "lastUpdated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_genres" (
    "artistId" TEXT NOT NULL,
    "genreId" INTEGER NOT NULL,

    CONSTRAINT "artist_genres_pkey" PRIMARY KEY ("artistId","genreId")
);

-- CreateTable
CREATE TABLE "platform_metrics" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "metricDate" DATE NOT NULL,
    "followers" BIGINT NOT NULL DEFAULT 0,
    "likes" BIGINT NOT NULL DEFAULT 0,
    "shares" BIGINT NOT NULL DEFAULT 0,
    "comments" BIGINT NOT NULL DEFAULT 0,
    "streams" BIGINT NOT NULL DEFAULT 0,
    "rogDaily" DECIMAL(8,4),
    "rogWeekly" DECIMAL(8,4),
    "rogMonthly" DECIMAL(8,4),
    "source" "MetricSource" NOT NULL DEFAULT 'API',
    "rawSnapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concerts" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "concertName" TEXT,
    "concertDate" DATE NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "venueName" TEXT,
    "capacity" INTEGER,
    "ticketsSold" INTEGER NOT NULL DEFAULT 0,
    "avgTicketPrice" DECIMAL(10,2),
    "totalRevenue" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_demographics" (
    "id" TEXT NOT NULL,
    "artistId" TEXT,
    "concertId" TEXT,
    "dimension" "DemographicDimension" NOT NULL,
    "dimensionValue" VARCHAR(100) NOT NULL,
    "percentage" DECIMAL(5,2),
    "absoluteCount" INTEGER,
    "sourcePlatform" VARCHAR(100),
    "metricDate" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_demographics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artists_artistName_key" ON "artists"("artistName");

-- CreateIndex
CREATE INDEX "artists_artistName_idx" ON "artists"("artistName");

-- CreateIndex
CREATE INDEX "artists_active_idx" ON "artists"("active");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE INDEX "platform_metrics_artistId_platform_metricDate_idx" ON "platform_metrics"("artistId", "platform", "metricDate");

-- CreateIndex
CREATE INDEX "platform_metrics_metricDate_idx" ON "platform_metrics"("metricDate");

-- CreateIndex
CREATE UNIQUE INDEX "platform_metrics_artistId_platform_metricDate_key" ON "platform_metrics"("artistId", "platform", "metricDate");

-- CreateIndex
CREATE INDEX "concerts_artistId_concertDate_idx" ON "concerts"("artistId", "concertDate");

-- CreateIndex
CREATE INDEX "concerts_city_idx" ON "concerts"("city");

-- CreateIndex
CREATE INDEX "concerts_country_idx" ON "concerts"("country");

-- CreateIndex
CREATE INDEX "audience_demographics_artistId_idx" ON "audience_demographics"("artistId");

-- CreateIndex
CREATE INDEX "audience_demographics_concertId_idx" ON "audience_demographics"("concertId");

-- CreateIndex
CREATE INDEX "audience_demographics_dimension_idx" ON "audience_demographics"("dimension");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- AddForeignKey
ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_metrics" ADD CONSTRAINT "platform_metrics_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concerts" ADD CONSTRAINT "concerts_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_demographics" ADD CONSTRAINT "audience_demographics_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_demographics" ADD CONSTRAINT "audience_demographics_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "concerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
