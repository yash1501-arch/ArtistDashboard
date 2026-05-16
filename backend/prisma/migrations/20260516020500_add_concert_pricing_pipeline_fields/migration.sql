ALTER TABLE "concerts"
ADD COLUMN "ticketPriceVip" DECIMAL(10, 2),
ADD COLUMN "ticketPriceTier1" DECIMAL(10, 2),
ADD COLUMN "ticketPriceTier2" DECIMAL(10, 2),
ADD COLUMN "ticketPriceTier3" DECIMAL(10, 2),
ADD COLUMN "artistCityPopularity" DECIMAL(5, 2),
ADD COLUMN "demandScore" DECIMAL(5, 2);

CREATE INDEX "concerts_source_idx" ON "concerts"("source");
CREATE INDEX "concerts_sourceUrl_idx" ON "concerts"("sourceUrl");
