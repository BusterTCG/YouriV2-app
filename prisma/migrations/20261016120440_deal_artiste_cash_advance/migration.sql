-- Avance de trésorerie depuis des cachets non payés (2026-10-16, idem KN) : DealArtiste.cashAdvanceId.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DealArtiste" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "cachetAmount" DECIMAL,
    "sharePct" DECIMAL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "paidAt" DATETIME,
    "cashAdvanceId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "DealArtiste_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DealArtiste_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DealArtiste_cashAdvanceId_fkey" FOREIGN KEY ("cashAdvanceId") REFERENCES "ArtistMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DealArtiste" ("artistId", "cachetAmount", "createdAt", "dealId", "deletedAt", "id", "notes", "paidAt", "paymentStatus", "sharePct", "updatedAt") SELECT "artistId", "cachetAmount", "createdAt", "dealId", "deletedAt", "id", "notes", "paidAt", "paymentStatus", "sharePct", "updatedAt" FROM "DealArtiste";
DROP TABLE "DealArtiste";
ALTER TABLE "new_DealArtiste" RENAME TO "DealArtiste";
CREATE INDEX "DealArtiste_artistId_idx" ON "DealArtiste"("artistId");
CREATE INDEX "DealArtiste_deletedAt_idx" ON "DealArtiste"("deletedAt");
CREATE UNIQUE INDEX "DealArtiste_dealId_artistId_key" ON "DealArtiste"("dealId", "artistId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
