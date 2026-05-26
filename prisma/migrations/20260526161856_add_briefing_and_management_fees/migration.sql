/*
  Warnings:

  - You are about to drop the column `commissionAmount` on the `DealArtiste` table. All the data in the column will be lost.
  - You are about to drop the column `commissionPaidAt` on the `DealArtiste` table. All the data in the column will be lost.
  - You are about to drop the column `commissionPct` on the `DealArtiste` table. All the data in the column will be lost.
  - You are about to drop the column `commissionStatus` on the `DealArtiste` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "pangeeKey" TEXT;

-- CreateTable
CREATE TABLE "DealCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "DealCharge_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DealManagementFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "associateKey" TEXT NOT NULL,
    "sharePct" DECIMAL NOT NULL,
    "amount" DECIMAL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "DealManagementFee_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventBriefing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "venueId" TEXT,
    "venueName" TEXT,
    "venueCity" TEXT,
    "venueAddress" TEXT,
    "showTime" TEXT,
    "balanceTime" TEXT,
    "capacity" INTEGER,
    "hotelName" TEXT,
    "hotelAddress" TEXT,
    "restaurantName" TEXT,
    "restaurantAddress" TEXT,
    "restaurantCovered" BOOLEAN NOT NULL DEFAULT false,
    "perDiemFlag" BOOLEAN NOT NULL DEFAULT false,
    "perDiemAmount" DECIMAL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventBriefing_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BriefingTravel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "briefingId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "fromStation" TEXT NOT NULL,
    "fromTime" TEXT NOT NULL,
    "toStation" TEXT NOT NULL,
    "toTime" TEXT NOT NULL,
    "comment" TEXT,
    "runs" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BriefingTravel_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "EventBriefing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BriefingContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "briefingId" TEXT NOT NULL,
    "contactId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BriefingContact_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "EventBriefing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("category", "createdAt", "createdById", "date", "deletedAt", "description", "id", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "showTime", "status", "title", "updatedAt", "venueCity", "venueId", "venueName") SELECT "category", "createdAt", "createdById", "date", "deletedAt", "description", "id", "notes", "organizerCity", "organizerCompany", "organizerId", "organizerName", "showTime", "status", "title", "updatedAt", "venueCity", "venueId", "venueName" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");
CREATE INDEX "Deal_category_idx" ON "Deal"("category");
CREATE INDEX "Deal_date_idx" ON "Deal"("date");
CREATE TABLE "new_DealArtiste" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "cachetAmount" DECIMAL,
    "sharePct" DECIMAL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "DealArtiste_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DealArtiste_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DealArtiste" ("artistId", "cachetAmount", "createdAt", "dealId", "deletedAt", "id", "notes", "paymentStatus", "updatedAt") SELECT "artistId", "cachetAmount", "createdAt", "dealId", "deletedAt", "id", "notes", "paymentStatus", "updatedAt" FROM "DealArtiste";
DROP TABLE "DealArtiste";
ALTER TABLE "new_DealArtiste" RENAME TO "DealArtiste";
CREATE INDEX "DealArtiste_artistId_idx" ON "DealArtiste"("artistId");
CREATE INDEX "DealArtiste_deletedAt_idx" ON "DealArtiste"("deletedAt");
CREATE UNIQUE INDEX "DealArtiste_dealId_artistId_key" ON "DealArtiste"("dealId", "artistId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DealCharge_dealId_idx" ON "DealCharge"("dealId");

-- CreateIndex
CREATE INDEX "DealCharge_deletedAt_idx" ON "DealCharge"("deletedAt");

-- CreateIndex
CREATE INDEX "DealManagementFee_dealId_idx" ON "DealManagementFee"("dealId");

-- CreateIndex
CREATE INDEX "DealManagementFee_associateKey_idx" ON "DealManagementFee"("associateKey");

-- CreateIndex
CREATE INDEX "DealManagementFee_deletedAt_idx" ON "DealManagementFee"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealManagementFee_dealId_role_associateKey_key" ON "DealManagementFee"("dealId", "role", "associateKey");

-- CreateIndex
CREATE UNIQUE INDEX "EventBriefing_dealId_key" ON "EventBriefing"("dealId");

-- CreateIndex
CREATE INDEX "EventBriefing_deletedAt_idx" ON "EventBriefing"("deletedAt");

-- CreateIndex
CREATE INDEX "BriefingTravel_briefingId_idx" ON "BriefingTravel"("briefingId");

-- CreateIndex
CREATE INDEX "BriefingContact_briefingId_idx" ON "BriefingContact"("briefingId");
