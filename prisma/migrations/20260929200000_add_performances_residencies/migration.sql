-- Refonte « Production » (portage KuroNeko-App, Stan 2026-09-29) — étape 2 :
-- séances (Performance) et résidences (Residency).

-- CreateTable
CREATE TABLE "Residency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venueId" TEXT,
    "venueName" TEXT,
    "venueCity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Residency_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Performance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "time" TEXT,
    "capacity" INTEGER,
    "paying" INTEGER,
    "invited" INTEGER,
    "grossTicketing" DECIMAL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Performance_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AddColumn (ALTER plutôt que la redéfinition complète de "Deal" — cf.
-- migration add_productions).
ALTER TABLE "Deal" ADD COLUMN "residencyId" TEXT REFERENCES "Residency" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Deal_residencyId_idx" ON "Deal"("residencyId");

-- CreateIndex
CREATE INDEX "Residency_productionId_idx" ON "Residency"("productionId");

-- CreateIndex
CREATE INDEX "Performance_dealId_date_idx" ON "Performance"("dealId", "date");

-- ─── Reprise des données ───────────────────────────────────────────────
-- Dates en base = millisecondes epoch (DateTime Prisma/SQLite). Séances au
-- jour UTC midi. Deal.date Youri porte parfois l'heure du show : jour = jour
-- UTC de la date (les shows finissent avant minuit Paris = 22h/23h UTC).

-- 1a. Mois complets : 1 séance par jour coché (multiDateDates JSON ; jours
--     dédoublonnés, horodatages ISO ramenés au jour).
INSERT INTO "Performance" ("id", "dealId", "date", "time", "cancelled", "createdAt", "updatedAt")
SELECT 'pf' || lower(hex(randomblob(11))), x."dealId",
       CAST(strftime('%s', x."day" || ' 12:00:00') AS INTEGER) * 1000,
       x."showTime", 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM (
  SELECT DISTINCT d."id" AS "dealId", d."showTime" AS "showTime", substr(j.value, 1, 10) AS "day"
  FROM "Deal" d, json_each(d."multiDateDates") j
  WHERE d."category" = 'PROD_EXE' AND d."isMultiDate" = 1
    AND d."multiDateDates" IS NOT NULL AND json_valid(d."multiDateDates")
    AND substr(j.value, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
) x;

-- 1b. Mois complets sans jours cochés : 1 séance à la date du deal.
INSERT INTO "Performance" ("id", "dealId", "date", "time", "cancelled", "createdAt", "updatedAt")
SELECT 'pf' || lower(hex(randomblob(11))), d."id",
       CAST(strftime('%s', strftime('%Y-%m-%d', d."date" / 1000, 'unixepoch') || ' 12:00:00') AS INTEGER) * 1000,
       d."showTime", 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM "Deal" d
WHERE d."category" = 'PROD_EXE' AND d."isMultiDate" = 1
  AND NOT EXISTS (SELECT 1 FROM "Performance" p WHERE p."dealId" = d."id");

-- 1c. Dates simples : 1 séance par horaire (« 21h00 / 22h30 » = doublé,
--     « 19h / 21h / 23h » = triplé). Une seule séance → payants / invités /
--     billetterie repris ; plusieurs → à ventiler séance par séance.
--     Billetterie : salle louée (PROD) = Recette HT saisie (la billetterie
--     EST la recette) ; sinon CA global billetterie (co-réa).
WITH RECURSIVE "slots"("dealId", "slot", "rest", "n") AS (
  SELECT d."id", NULL, COALESCE(d."showTime", '') || '/', 0
  FROM "Deal" d
  WHERE d."category" = 'PROD_EXE' AND d."isMultiDate" = 0
  UNION ALL
  SELECT "dealId",
         TRIM(substr("rest", 1, instr("rest", '/') - 1)),
         substr("rest", instr("rest", '/') + 1),
         "n" + 1
  FROM "slots"
  WHERE "rest" <> ''
),
"times" AS (
  SELECT "dealId", NULLIF("slot", '') AS "time", "n" FROM "slots" WHERE "n" > 0
),
"counted" AS (
  SELECT t.*, (SELECT COUNT(*) FROM "times" t2 WHERE t2."dealId" = t."dealId") AS "cnt" FROM "times" t
)
INSERT INTO "Performance" ("id", "dealId", "date", "time", "paying", "invited", "grossTicketing", "cancelled", "createdAt", "updatedAt")
SELECT 'pf' || lower(hex(randomblob(11))), d."id",
       CAST(strftime('%s', strftime('%Y-%m-%d', d."date" / 1000, 'unixepoch') || ' 12:00:00') AS INTEGER) * 1000,
       c."time",
       CASE WHEN c."cnt" = 1 THEN d."paying" END,
       CASE WHEN c."cnt" = 1 THEN d."invited" END,
       CASE WHEN c."cnt" = 1 THEN (
         CASE WHEN d."venueDealKind" = 'PROD' THEN COALESCE((
             SELECT SUM(l."amount") FROM "ProductionLine" l
             WHERE l."dealId" = d."id" AND l."label" = 'RECETTE_HT'
               AND l."deletedAt" IS NULL AND l."coveredByVenue" = 0
           ), d."coRealGrossCa")
           ELSE d."coRealGrossCa" END
       ) END,
       0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM "counted" c JOIN "Deal" d ON d."id" = c."dealId";

-- 2. Compteur de représentations = nombre de séances ; date du deal = 1re
--    séance (UTC midi, comme le fera l'app à chaque modification).
UPDATE "Deal"
SET "performanceCount" = (SELECT COUNT(*) FROM "Performance" p WHERE p."dealId" = "Deal"."id" AND p."cancelled" = 0)
WHERE "category" = 'PROD_EXE';

UPDATE "Deal"
SET "date" = (SELECT MIN(p."date") FROM "Performance" p WHERE p."dealId" = "Deal"."id")
WHERE "category" = 'PROD_EXE'
  AND EXISTS (SELECT 1 FROM "Performance" p WHERE p."dealId" = "Deal"."id");

-- 3. Résidences : les mois complets d'une même production dans une même salle
--    (salle KN liée, sinon nom de salle saisi, sinon titre).
INSERT INTO "Residency" ("id", "productionId", "name", "venueId", "venueName", "venueCity", "createdAt", "updatedAt")
SELECT 'rsd' || lower(hex(randomblob(11))), g."productionId", g."name", g."venueId", g."venueName", g."venueCity",
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM (
  SELECT "productionId",
         "venueId",
         MIN(COALESCE(NULLIF(trim("venueName"), ''), trim("title"))) AS "name",
         MIN("venueName") AS "venueName",
         MIN("venueCity") AS "venueCity"
  FROM "Deal"
  WHERE "category" = 'PROD_EXE' AND "isMultiDate" = 1 AND "productionId" IS NOT NULL
  GROUP BY "productionId", COALESCE("venueId", lower(COALESCE(NULLIF(trim("venueName"), ''), trim("title"))))
) g;

UPDATE "Deal"
SET "residencyId" = (
  SELECT r."id" FROM "Residency" r
  WHERE r."productionId" = "Deal"."productionId"
    AND (
      ("Deal"."venueId" IS NOT NULL AND r."venueId" = "Deal"."venueId")
      OR ("Deal"."venueId" IS NULL AND r."venueId" IS NULL
          AND lower(r."name") = lower(COALESCE(NULLIF(trim("Deal"."venueName"), ''), trim("Deal"."title"))))
    )
  LIMIT 1
)
WHERE "category" = 'PROD_EXE' AND "isMultiDate" = 1 AND "productionId" IS NOT NULL;

-- 4. Fusion des doublons (KN merge_duplicate_residencies) : une même salle
--    peut donner 2 résidences quand un mois n'a pas de salle liée. On fusionne
--    par (production, nom) sur la résidence qui a une salle liée, puis on
--    supprime les résidences vides.
UPDATE "Deal"
SET "residencyId" = (
  SELECT k."id" FROM "Residency" k
  WHERE k."productionId" = (SELECT r."productionId" FROM "Residency" r WHERE r."id" = "Deal"."residencyId")
    AND lower(k."name") = (SELECT lower(r."name") FROM "Residency" r WHERE r."id" = "Deal"."residencyId")
  ORDER BY (k."venueId" IS NULL), k."id"
  LIMIT 1
)
WHERE "residencyId" IS NOT NULL;

DELETE FROM "Residency"
WHERE NOT EXISTS (SELECT 1 FROM "Deal" d WHERE d."residencyId" = "Residency"."id");
