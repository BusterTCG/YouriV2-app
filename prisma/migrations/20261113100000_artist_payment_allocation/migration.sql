-- Acomptes de quote-part (Stan 2026-11-13) : part d'un versement attribuée à
-- une date jouée sans la solder.

-- CreateTable
CREATE TABLE "ArtistPaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movementId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtistPaymentAllocation_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "ArtistMovement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArtistPaymentAllocation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ArtistPaymentAllocation_movementId_idx" ON "ArtistPaymentAllocation"("movementId");

-- CreateIndex
CREATE INDEX "ArtistPaymentAllocation_dealId_idx" ON "ArtistPaymentAllocation"("dealId");

