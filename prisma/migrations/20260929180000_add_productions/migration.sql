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

-- 2. Clé de rattachement de chaque date PROD_EXE :
--    - artiste principal = 1er DealArtiste (même règle que setDealPrimaryArtist) ;
--      pour une date en corbeille, ses DealArtiste y sont partis avec elle
--      (même horodatage) → on les prend en compte ;
--    - nom normalisé comme l'app (normalizeProductionName : espaces, casse,
--      accents) → pas de doublons « Élan » / « élan ».
CREATE TEMP TABLE "_prod_key" AS
SELECT d."id" AS "dealId",
       d."deletedAt" AS "deletedAt",
       NULLIF(TRIM(d."showName"), '') AS "showName",
       d."title" AS "title",
       (SELECT da."artistId" FROM "DealArtiste" da
         WHERE da."dealId" = d."id"
           AND (da."deletedAt" IS NULL OR da."deletedAt" = d."deletedAt")
         ORDER BY da."createdAt" ASC LIMIT 1) AS "artistId",
       REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(d."showName"), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')), 'À', 'à'), 'Â', 'â'), 'Ä', 'ä'), 'Ç', 'ç'), 'É', 'é'), 'È', 'è'), 'Ê', 'ê'), 'Ë', 'ë'), 'Î', 'î'), 'Ï', 'ï'), 'Ô', 'ô'), 'Ö', 'ö'), 'Ù', 'ù'), 'Û', 'û'), 'Ü', 'ü'), 'Œ', 'œ'), 'Æ', 'æ'), 'Ÿ', 'ÿ') AS "nameKey"
FROM "Deal" d
WHERE d."category" = 'PROD_EXE';

-- 3. 1 production par (artiste principal, nom normalisé) à partir des dates
--    actives nommées. Dates en ms epoch (format Prisma SQLite).
INSERT INTO "Production" ("id", "artistId", "name", "status", "createdAt", "updatedAt")
SELECT 'prd' || lower(hex(randomblob(11))), g."artistId", g."name", 'ACTIVE',
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (
  SELECT k."artistId",
         MIN(REPLACE(REPLACE(REPLACE(k."showName", '  ', ' '), '  ', ' '), '  ', ' ')) AS "name",
         k."nameKey"
  FROM "_prod_key" k
  WHERE k."deletedAt" IS NULL AND k."showName" IS NOT NULL AND k."artistId" IS NOT NULL
  GROUP BY k."artistId", k."nameKey"
) g;

-- Rattachement des dates nommées (y compris en corbeille, pour une
-- restauration propre).
UPDATE "Deal"
SET "productionId" = (
  SELECT p."id" FROM "Production" p JOIN "_prod_key" k ON k."dealId" = "Deal"."id"
  WHERE p."artistId" = k."artistId" AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(p."name"), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')), 'À', 'à'), 'Â', 'â'), 'Ä', 'ä'), 'Ç', 'ç'), 'É', 'é'), 'È', 'è'), 'Ê', 'ê'), 'Ë', 'ë'), 'Î', 'î'), 'Ï', 'ï'), 'Ô', 'ô'), 'Ö', 'ö'), 'Ù', 'ù'), 'Û', 'û'), 'Ü', 'ü'), 'Œ', 'œ'), 'Æ', 'æ'), 'Ÿ', 'ÿ') = k."nameKey"
  LIMIT 1
)
WHERE "id" IN (SELECT "dealId" FROM "_prod_key" WHERE "showName" IS NOT NULL AND "artistId" IS NOT NULL);

-- 3b. Dates sans nom de spectacle (KN link_productions_by_title, adapté au
--     format de titre Youri « Artiste - Spectacle @ Salle » / « Artiste -
--     Spectacle ») : rattachées si le spectacle du titre correspond à une
--     production existante de l'artiste ; leur showName est alors renseigné.
CREATE TEMP TABLE "_title_key" AS
SELECT k."dealId", k."artistId",
       CASE WHEN instr(rest, ' @ ') > 0 THEN TRIM(substr(rest, 1, instr(rest, ' @ ') - 1)) ELSE TRIM(rest) END AS "fromTitle"
FROM (
  SELECT k."dealId", k."artistId",
         substr(k."title", length(a."name") + 4) AS rest
  FROM "_prod_key" k JOIN "Artist" a ON a."id" = k."artistId"
  WHERE k."showName" IS NULL
    AND substr(k."title", 1, length(a."name") + 3) = a."name" || ' - '
) k;

UPDATE "Deal"
SET "productionId" = (
      SELECT p."id" FROM "Production" p JOIN "_title_key" t ON t."dealId" = "Deal"."id"
      WHERE p."artistId" = t."artistId" AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(p."name"), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')), 'À', 'à'), 'Â', 'â'), 'Ä', 'ä'), 'Ç', 'ç'), 'É', 'é'), 'È', 'è'), 'Ê', 'ê'), 'Ë', 'ë'), 'Î', 'î'), 'Ï', 'ï'), 'Ô', 'ô'), 'Ö', 'ö'), 'Ù', 'ù'), 'Û', 'û'), 'Ü', 'ü'), 'Œ', 'œ'), 'Æ', 'æ'), 'Ÿ', 'ÿ') = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(t."fromTitle"), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')), 'À', 'à'), 'Â', 'â'), 'Ä', 'ä'), 'Ç', 'ç'), 'É', 'é'), 'È', 'è'), 'Ê', 'ê'), 'Ë', 'ë'), 'Î', 'î'), 'Ï', 'ï'), 'Ô', 'ô'), 'Ö', 'ö'), 'Ù', 'ù'), 'Û', 'û'), 'Ü', 'ü'), 'Œ', 'œ'), 'Æ', 'æ'), 'Ÿ', 'ÿ')
      LIMIT 1
    )
WHERE "id" IN (SELECT "dealId" FROM "_title_key");

UPDATE "Deal"
SET "showName" = (SELECT p."name" FROM "Production" p WHERE p."id" = "Deal"."productionId")
WHERE "id" IN (SELECT "dealId" FROM "_title_key") AND "productionId" IS NOT NULL;

DROP TABLE "_title_key";
DROP TABLE "_prod_key";

-- 4. Contrat artiste de la production (modèle KN : contrat principal pour
--    les dates uniques / tournées, « Contrat résidences » séparé possible).
--    Ex. Sossam : 10 % sur la résidence à Paris, 15 % sur les autres dates.
--    - contrat principal = taux de la date unique (hors mois de résidence) la
--      plus récente ; à défaut (que des résidences), celui du mois le plus récent ;
--    - contrat résidences = taux du mois de résidence le plus récent ; séparé
--      seulement s'il diffère du contrat principal (sinon « Même contrat que
--      les dates uniques », défaut KN).
--    Prod-exé seule, co-prod 0 (cf. étape 1). Les dates dont le taux diffère
--    encore de leur contrat cible sont listées par le rapport de répétition.
UPDATE "Production"
SET
  "artistShareKind" = 'PROD_EXE',
  "coprodKnPct" = 0,
  "prodExePct" = COALESCE(
    (SELECT d."prodExePct" FROM "Deal" d
      WHERE d."productionId" = "Production"."id" AND d."deletedAt" IS NULL
        AND d."isMultiDate" = 0 AND d."prodExePct" IS NOT NULL
      ORDER BY d."date" DESC LIMIT 1),
    (SELECT d."prodExePct" FROM "Deal" d
      WHERE d."productionId" = "Production"."id" AND d."deletedAt" IS NULL
        AND d."prodExePct" IS NOT NULL
      ORDER BY d."date" DESC LIMIT 1),
    15);

UPDATE "Production"
SET
  "residencyContractSeparate" = 1,
  "residencyArtistShareKind" = 'PROD_EXE',
  "residencyCoprodKnPct" = 0,
  "residencyProdExePct" = (
    SELECT d."prodExePct" FROM "Deal" d
    WHERE d."productionId" = "Production"."id" AND d."deletedAt" IS NULL
      AND d."isMultiDate" = 1 AND d."prodExePct" IS NOT NULL
    ORDER BY d."date" DESC LIMIT 1)
WHERE EXISTS (
    SELECT 1 FROM "Deal" d
    WHERE d."productionId" = "Production"."id" AND d."deletedAt" IS NULL AND d."isMultiDate" = 0)
  AND CAST((
    SELECT d."prodExePct" FROM "Deal" d
    WHERE d."productionId" = "Production"."id" AND d."deletedAt" IS NULL
      AND d."isMultiDate" = 1 AND d."prodExePct" IS NOT NULL
    ORDER BY d."date" DESC LIMIT 1) AS REAL) <> CAST("prodExePct" AS REAL);
