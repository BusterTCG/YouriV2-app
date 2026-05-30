-- CreateTable
CREATE TABLE "CachetPrestation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "prestataire" TEXT NOT NULL,
    "amount" DECIMAL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "paidAt" DATETIME,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "CachetPrestation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CachetPrestation_dealId_deletedAt_idx" ON "CachetPrestation"("dealId", "deletedAt");
