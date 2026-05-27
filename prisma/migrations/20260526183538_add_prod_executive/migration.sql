-- CreateTable
CREATE TABLE "ProductionLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "customLabel" TEXT,
    "amount" DECIMAL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "paidAt" DATETIME,
    "comment" TEXT,
    "coveredByVenue" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ProductionLine_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "venueRoomId" TEXT,
    "grossAmount" DECIMAL,
    "commissionPct" DECIMAL,
    "commissionAmount" DECIMAL,
    "artistAmount" DECIMAL,
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "category", "createdAt", "createdById", "date", "deletedAt", "description", "id", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "showTime", "status", "title", "updatedAt", "venueAddress", "venueCity", "venueId", "venueName") SELECT "budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "category", "createdAt", "createdById", "date", "deletedAt", "description", "id", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "showTime", "status", "title", "updatedAt", "venueAddress", "venueCity", "venueId", "venueName" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");
CREATE INDEX "Deal_category_idx" ON "Deal"("category");
CREATE INDEX "Deal_date_idx" ON "Deal"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductionLine_dealId_idx" ON "ProductionLine"("dealId");

-- CreateIndex
CREATE INDEX "ProductionLine_deletedAt_idx" ON "ProductionLine"("deletedAt");
