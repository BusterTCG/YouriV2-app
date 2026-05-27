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
    "artistStatus" TEXT NOT NULL DEFAULT 'N_A',
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("artistAmount", "budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "capacity", "category", "coRealGrossCa", "coRealKnPct", "commissionAmount", "commissionPct", "contractSigned", "createdAt", "createdById", "date", "deletedAt", "description", "endTime", "grossAmount", "id", "invited", "isMultiDate", "multiDateDates", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "paying", "performanceCount", "prodExePct", "showName", "showTime", "status", "ticketingReady", "ticketingUrl", "title", "updatedAt", "venueAddress", "venueCity", "venueDealKind", "venueId", "venueName", "venueRoomId", "vhrBooked") SELECT "artistAmount", "budgetAmount", "budgetPaidAt", "budgetPaymentStatus", "capacity", "category", "coRealGrossCa", "coRealKnPct", "commissionAmount", "commissionPct", "contractSigned", "createdAt", "createdById", "date", "deletedAt", "description", "endTime", "grossAmount", "id", "invited", "isMultiDate", "multiDateDates", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "paying", "performanceCount", "prodExePct", "showName", "showTime", "status", "ticketingReady", "ticketingUrl", "title", "updatedAt", "venueAddress", "venueCity", "venueDealKind", "venueId", "venueName", "venueRoomId", "vhrBooked" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");
CREATE INDEX "Deal_category_idx" ON "Deal"("category");
CREATE INDEX "Deal_date_idx" ON "Deal"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
