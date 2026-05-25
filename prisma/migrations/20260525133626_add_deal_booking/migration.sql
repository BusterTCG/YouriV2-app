-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LEAD',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME NOT NULL,
    "showTime" TEXT,
    "organizerId" TEXT,
    "organizerName" TEXT,
    "organizerCompany" TEXT,
    "organizerCity" TEXT,
    "venueId" TEXT,
    "venueName" TEXT,
    "venueCity" TEXT,
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DealArtiste" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "cachetAmount" DECIMAL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "commissionAmount" DECIMAL,
    "commissionStatus" TEXT NOT NULL DEFAULT 'N_A',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "DealArtiste_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DealArtiste_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");

-- CreateIndex
CREATE INDEX "Deal_category_idx" ON "Deal"("category");

-- CreateIndex
CREATE INDEX "Deal_date_idx" ON "Deal"("date");

-- CreateIndex
CREATE INDEX "DealArtiste_artistId_idx" ON "DealArtiste"("artistId");

-- CreateIndex
CREATE INDEX "DealArtiste_deletedAt_idx" ON "DealArtiste"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealArtiste_dealId_artistId_key" ON "DealArtiste"("dealId", "artistId");
