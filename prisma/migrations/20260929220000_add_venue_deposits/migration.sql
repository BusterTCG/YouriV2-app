-- Acompte salle = caution (portage KN, Stan 2026-09-29) — étape 3.
-- CreateTable
CREATE TABLE "VenueDeposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" DECIMAL NOT NULL,
    "paidAt" DATETIME,
    "refundedAt" DATETIME,
    "note" TEXT,
    "residencyId" TEXT,
    "dealId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VenueDeposit_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VenueDeposit_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VenueDeposit_residencyId_key" ON "VenueDeposit"("residencyId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueDeposit_dealId_key" ON "VenueDeposit"("dealId");
