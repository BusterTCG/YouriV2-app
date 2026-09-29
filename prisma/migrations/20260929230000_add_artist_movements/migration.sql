-- Compte artiste (portage KN, Stan 2026-09-29) — étape 4.

-- CreateTable
CREATE TABLE "ArtistMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArtistMovement_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ArtistMovement_productionId_idx" ON "ArtistMovement"("productionId");

-- ─── Reprise : dates de production déjà marquées « Part artiste payée » ──
-- Chaque date PAID devient un mouvement du compte artiste de sa production
-- (part positive → quote-part versée, négative → remboursement de l'artiste),
-- à la date du spectacle — les statuts sont ensuite dérivés du compte.
INSERT INTO "ArtistMovement" ("id", "productionId", "kind", "amount", "date", "note", "createdAt", "updatedAt")
SELECT 'am' || lower(hex(randomblob(11))), d."productionId",
       CASE WHEN d."artistAmount" >= 0 THEN 'PAYMENT' ELSE 'REFUND' END,
       abs(d."artistAmount"), d."date",
       'Reprise : date marquée payée — ' || d."title",
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM "Deal" d
WHERE d."category" = 'PROD_EXE'
  AND d."productionId" IS NOT NULL
  AND d."deletedAt" IS NULL
  AND d."artistStatus" = 'PAID'
  AND d."artistAmount" IS NOT NULL
  AND d."artistAmount" <> 0;
