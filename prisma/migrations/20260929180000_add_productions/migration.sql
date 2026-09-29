-- Refonte « Production » (portage KuroNeko-App, Stan 2026-09-29) — étape 1 :
-- socle Production (spectacle d'un artiste) + contrat artiste à deux taux.

-- CreateTable
CREATE TABLE "Production" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artistShareKind" TEXT,
    "coprodKnPct" DECIMAL,
    "prodExePct" DECIMAL,
    "residencyContractSeparate" BOOLEAN NOT NULL DEFAULT false,
    "residencyArtistShareKind" TEXT,
    "residencyCoprodKnPct" DECIMAL,
    "residencyProdExePct" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Production_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionOverhead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATETIME,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TO_INVOICE',
    "paidAt" DATETIME,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionOverhead_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AddColumn (ALTER plutôt que la redéfinition complète de "Deal" générée par
-- Prisma, comme KN : SQLite accepte une colonne FK nullable en ADD COLUMN, et
-- on évite de recopier toute la table en prod).
ALTER TABLE "Deal" ADD COLUMN "productionId" TEXT REFERENCES "Production" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD COLUMN "artistShareKind" TEXT;
ALTER TABLE "Deal" ADD COLUMN "coprodKnPct" DECIMAL;
CREATE INDEX "Deal_productionId_idx" ON "Deal"("productionId");

-- CreateIndex
CREATE INDEX "Production_artistId_idx" ON "Production"("artistId");

-- CreateIndex
CREATE INDEX "ProductionOverhead_productionId_idx" ON "ProductionOverhead"("productionId");

-- ─── Reprise des données ───────────────────────────────────────────────

-- 1. Contrat artiste des dates : jusqu'ici Youri n'appliquait que la prod-exé
--    (prodExePct, 15 % par défaut quand vide). On le rend explicite, co-prod à
--    0 → aucun euro ne change.
UPDATE "Deal"
SET "artistShareKind" = 'PROD_EXE',
    "prodExePct" = COALESCE("prodExePct", 15),
    "coprodKnPct" = 0
WHERE "category" = 'PROD_EXE';

-- 2. 1 production par (artiste principal, nom de spectacle) à partir des dates
--    PROD_EXE existantes (showName non vide, insensible à la casse / aux
--    espaces). Artiste principal = 1er DealArtiste actif (même règle que
--    setDealPrimaryArtist). Dates en ms epoch (format Prisma SQLite).
INSERT INTO "Production" ("id", "artistId", "name", "status", "createdAt", "updatedAt")
SELECT 'prd' || lower(hex(randomblob(11))), g."artistId", g."name", 'ACTIVE',
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (
  SELECT x."artistId", MIN(TRIM(x."showName")) AS "name"
  FROM (
    SELECT d."showName",
           (SELECT da."artistId" FROM "DealArtiste" da
             WHERE da."dealId" = d."id" AND da."deletedAt" IS NULL
             ORDER BY da."createdAt" ASC LIMIT 1) AS "artistId"
    FROM "Deal" d
    WHERE d."category" = 'PROD_EXE'
      AND d."deletedAt" IS NULL
      AND d."showName" IS NOT NULL
      AND TRIM(d."showName") <> ''
  ) x
  WHERE x."artistId" IS NOT NULL
  GROUP BY x."artistId", LOWER(TRIM(x."showName"))
) g;

-- 3. Rattachement des dates (y compris en corbeille, pour une restauration propre).
UPDATE "Deal"
SET "productionId" = (
  SELECT p."id" FROM "Production" p
  WHERE p."artistId" = (
      SELECT da."artistId" FROM "DealArtiste" da
      WHERE da."dealId" = "Deal"."id" AND da."deletedAt" IS NULL
      ORDER BY da."createdAt" ASC LIMIT 1
    )
    AND LOWER(p."name") = LOWER(TRIM("Deal"."showName"))
)
WHERE "category" = 'PROD_EXE'
  AND "showName" IS NOT NULL
  AND TRIM("showName") <> '';

-- 4. Contrat artiste de la production = celui de la date la plus récente
--    (prod-exé seule, co-prod 0 — cf. étape 1).
UPDATE "Production"
SET
  "artistShareKind" = 'PROD_EXE',
  "coprodKnPct" = 0,
  "prodExePct" = COALESCE((
    SELECT d."prodExePct" FROM "Deal" d
    WHERE d."productionId" = "Production"."id" AND d."deletedAt" IS NULL
      AND d."prodExePct" IS NOT NULL
    ORDER BY d."date" DESC LIMIT 1
  ), 15);
