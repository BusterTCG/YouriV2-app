-- Recette HT saisie à la main en salle louée (Stan 2026-10-01, portage KN) :
-- la billetterie des séances ne l'écrase plus.

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
    "recetteManual" BOOLEAN NOT NULL DEFAULT false,
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
INSERT INTO "new_Deal" ("artistAmount", "artistShareKind", "artistStatus", "budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "cachetsFeesPct", "capacity", "category", "coRealGrossCa", "coRealKnPct", "commissionAmount", "commissionPct", "contractSigned", "coprodKnPct", "createdAt", "createdById", "date", "deletedAt", "description", "endTime", "grossAmount", "id", "invited", "isMultiDate", "linkedToOwnProd", "multiDateDates", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "paying", "performanceCount", "prodExePct", "productionId", "residencyId", "settledAt", "settledMovementId", "settledOverheadShare", "showName", "showTime", "status", "ticketingReady", "ticketingUrl", "title", "updatedAt", "venueAddress", "venueCity", "venueDealKind", "venueId", "venueName", "venueRoomId", "vhrBooked") SELECT "artistAmount", "artistShareKind", "artistStatus", "budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "cachetsFeesPct", "capacity", "category", "coRealGrossCa", "coRealKnPct", "commissionAmount", "commissionPct", "contractSigned", "coprodKnPct", "createdAt", "createdById", "date", "deletedAt", "description", "endTime", "grossAmount", "id", "invited", "isMultiDate", "linkedToOwnProd", "multiDateDates", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "paying", "performanceCount", "prodExePct", "productionId", "residencyId", "settledAt", "settledMovementId", "settledOverheadShare", "showName", "showTime", "status", "ticketingReady", "ticketingUrl", "title", "updatedAt", "venueAddress", "venueCity", "venueDealKind", "venueId", "venueName", "venueRoomId", "vhrBooked" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");
CREATE INDEX "Deal_category_idx" ON "Deal"("category");
CREATE INDEX "Deal_date_idx" ON "Deal"("date");
CREATE INDEX "Deal_productionId_idx" ON "Deal"("productionId");
CREATE INDEX "Deal_residencyId_idx" ON "Deal"("residencyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Reprise : salle louée dont la Recette HT diffère de la billetterie des
-- séances → marquée « saisie à la main » pour la préserver.
UPDATE "Deal" SET "recetteManual" = 1
WHERE "venueDealKind" = 'PROD'
  AND EXISTS (SELECT 1 FROM "ProductionLine" l WHERE l."dealId" = "Deal"."id" AND l."label" = 'RECETTE_HT' AND l."deletedAt" IS NULL)
  AND ABS(
    COALESCE((SELECT SUM(COALESCE(l."amount", 0)) FROM "ProductionLine" l
              WHERE l."dealId" = "Deal"."id" AND l."label" = 'RECETTE_HT' AND l."deletedAt" IS NULL), 0)
    - COALESCE("coRealGrossCa", 0)
  ) >= 0.01;
