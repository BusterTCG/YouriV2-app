-- Lot 3 (Stan 2026-10-01, portage KN) : date soldée (settledAt), quote-part de
-- frais généraux figée au solde, versement de quote-part qui a soldé la date.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LEAD',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME NOT NULL,
    "showTime" TEXT,
    "budgetAmount" DECIMAL,
    "budgetPaymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "budgetPaidAt" DATETIME,
    "organizerId" TEXT,
    "organizerName" TEXT,
    "organizerCompany" TEXT,
    "organizerCity" TEXT,
    "venueId" TEXT,
    "venueName" TEXT,
    "venueCity" TEXT,
    "venueAddress" TEXT,
    "venueDealKind" TEXT,
    "prodExePct" DECIMAL,
    "productionId" TEXT,
    "residencyId" TEXT,
    "artistShareKind" TEXT,
    "coprodKnPct" DECIMAL,
    "cachetsFeesPct" DECIMAL,
    "linkedToOwnProd" BOOLEAN NOT NULL DEFAULT false,
    "coRealKnPct" DECIMAL,
    "coRealGrossCa" DECIMAL,
    "capacity" INTEGER,
    "paying" INTEGER,
    "invited" INTEGER,
    "isMultiDate" BOOLEAN NOT NULL DEFAULT false,
    "performanceCount" INTEGER,
    "multiDateDates" JSONB,
    "showName" TEXT,
    "endTime" TEXT,
    "contractSigned" BOOLEAN NOT NULL DEFAULT false,
    "ticketingReady" BOOLEAN NOT NULL DEFAULT false,
    "ticketingUrl" TEXT,
    "vhrBooked" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" DATETIME,
    "settledOverheadShare" DECIMAL,
    "settledMovementId" TEXT,
    "venueRoomId" TEXT,
    "grossAmount" DECIMAL,
    "commissionPct" DECIMAL,
    "commissionAmount" DECIMAL,
    "artistAmount" DECIMAL,
    "artistStatus" TEXT NOT NULL DEFAULT 'N_A',
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_settledMovementId_fkey" FOREIGN KEY ("settledMovementId") REFERENCES "ArtistMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("artistAmount", "artistShareKind", "artistStatus", "budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "cachetsFeesPct", "capacity", "category", "coRealGrossCa", "coRealKnPct", "commissionAmount", "commissionPct", "contractSigned", "coprodKnPct", "createdAt", "createdById", "date", "deletedAt", "description", "endTime", "grossAmount", "id", "invited", "isMultiDate", "linkedToOwnProd", "multiDateDates", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "paying", "performanceCount", "prodExePct", "productionId", "residencyId", "showName", "showTime", "status", "ticketingReady", "ticketingUrl", "title", "updatedAt", "venueAddress", "venueCity", "venueDealKind", "venueId", "venueName", "venueRoomId", "vhrBooked") SELECT "artistAmount", "artistShareKind", "artistStatus", "budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "cachetsFeesPct", "capacity", "category", "coRealGrossCa", "coRealKnPct", "commissionAmount", "commissionPct", "contractSigned", "coprodKnPct", "createdAt", "createdById", "date", "deletedAt", "description", "endTime", "grossAmount", "id", "invited", "isMultiDate", "linkedToOwnProd", "multiDateDates", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "paying", "performanceCount", "prodExePct", "productionId", "residencyId", "showName", "showTime", "status", "ticketingReady", "ticketingUrl", "title", "updatedAt", "venueAddress", "venueCity", "venueDealKind", "venueId", "venueName", "venueRoomId", "vhrBooked" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");
CREATE INDEX "Deal_category_idx" ON "Deal"("category");
CREATE INDEX "Deal_date_idx" ON "Deal"("date");
CREATE INDEX "Deal_productionId_idx" ON "Deal"("productionId");
CREATE INDEX "Deal_residencyId_idx" ON "Deal"("residencyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Reprise : dates de production déjà réglées (statut artiste « réglé », dérivé
-- du compte artiste ⇒ jouées et couvertes par les versements) sans recette ni
-- charge en attente → soldées. Leur quote-part de frais généraux est figée par
-- l'app au premier chargement (freezeSettledOverheads, lib/finance/show-financials.ts).
UPDATE "Deal"
SET "settledAt" = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE "productionId" IS NOT NULL
  AND "category" = 'PROD_EXE'
  AND "deletedAt" IS NULL
  AND "status" <> 'ANNULE'
  AND "artistStatus" = 'PAID'
  AND NOT EXISTS (
    SELECT 1 FROM "ProductionLine" l
    WHERE l."dealId" = "Deal"."id" AND l."deletedAt" IS NULL
      AND COALESCE(l."amount", 0) <> 0 AND l."paymentStatus" <> 'PAID'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "DealArtiste" a
    WHERE a."dealId" = "Deal"."id" AND a."deletedAt" IS NULL
      AND COALESCE(a."cachetAmount", 0) <> 0 AND a."paymentStatus" <> 'PAID'
  );
