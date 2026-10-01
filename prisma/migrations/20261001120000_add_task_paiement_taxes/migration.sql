-- Tâche « Paiement taxes SACD CNM » entre « Envoie Facture » et « Paiement
-- Artiste » sur les dates de production (Stan 2026-10-01). Migration de
-- données uniquement (aucune modification de table).
--
-- 1. Modèle PROD_EXE : la tâche est insérée juste avant le 1er modèle
--    « Paiement artiste… » (décalé d'un cran), sinon en fin de pipeline.
-- 2. Dates existantes : ajoutée juste avant leur tâche « Paiement artiste… »
--    tant que celle-ci est encore à faire (TODO) — les dates déjà réglées ne
--    bougent pas. Idempotent : rien n'est fait si le libellé existe déjà.

-- 1a. Décale « Paiement artiste » et la suite
UPDATE "TaskTemplate"
SET "order" = "order" + 1,
    "updatedAt" = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE "category" = 'PROD_EXE'
  AND "deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TaskTemplate" x
    WHERE x."category" = 'PROD_EXE' AND x."deletedAt" IS NULL
      AND x."label" = 'Paiement taxes SACD CNM'
  )
  AND "order" >= (
    SELECT MIN(p."order") FROM "TaskTemplate" p
    WHERE p."category" = 'PROD_EXE' AND p."deletedAt" IS NULL
      AND lower(p."label") LIKE 'paiement artiste%'
  );

-- 1b. Insère le modèle (place libérée, ou fin de pipeline)
INSERT INTO "TaskTemplate" ("id", "category", "order", "label", "defaultAssigneeKey", "createdAt", "updatedAt")
SELECT 'tpl' || lower(hex(randomblob(11))), 'PROD_EXE',
       COALESCE(
         (SELECT MIN(p."order") - 1 FROM "TaskTemplate" p
          WHERE p."category" = 'PROD_EXE' AND p."deletedAt" IS NULL
            AND lower(p."label") LIKE 'paiement artiste%'),
         (SELECT COALESCE(MAX(m."order"), -1) + 1 FROM "TaskTemplate" m
          WHERE m."category" = 'PROD_EXE' AND m."deletedAt" IS NULL)
       ),
       'Paiement taxes SACD CNM', 'angath',
       CAST(strftime('%s','now') AS INTEGER) * 1000,
       CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE EXISTS (
    SELECT 1 FROM "TaskTemplate" e WHERE e."category" = 'PROD_EXE' AND e."deletedAt" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "TaskTemplate" x
    WHERE x."category" = 'PROD_EXE' AND x."deletedAt" IS NULL
      AND x."label" = 'Paiement taxes SACD CNM'
  );

-- 2. Dates existantes encore à régler
CREATE TEMP TABLE "_taxes_target" AS
SELECT t."dealId" AS "dealId", MIN(t."order") AS "pos"
FROM "Task" t
JOIN "Deal" d ON d."id" = t."dealId"
WHERE d."category" = 'PROD_EXE'
  AND d."deletedAt" IS NULL
  AND t."deletedAt" IS NULL
  AND t."status" = 'TODO'
  AND lower(t."label") LIKE 'paiement artiste%'
  AND NOT EXISTS (
    SELECT 1 FROM "Task" x
    WHERE x."dealId" = t."dealId" AND x."deletedAt" IS NULL
      AND x."label" = 'Paiement taxes SACD CNM'
  )
GROUP BY t."dealId";

UPDATE "Task"
SET "order" = "order" + 1,
    "updatedAt" = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE "deletedAt" IS NULL
  AND "dealId" IN (SELECT "dealId" FROM "_taxes_target")
  AND "order" >= (SELECT g."pos" FROM "_taxes_target" g WHERE g."dealId" = "Task"."dealId");

INSERT INTO "Task" ("id", "dealId", "templateId", "order", "label", "assigneeKey", "status", "createdAt", "updatedAt")
SELECT 'tsk' || lower(hex(randomblob(11))), g."dealId",
       (SELECT tp."id" FROM "TaskTemplate" tp
        WHERE tp."category" = 'PROD_EXE' AND tp."deletedAt" IS NULL
          AND tp."label" = 'Paiement taxes SACD CNM' LIMIT 1),
       g."pos", 'Paiement taxes SACD CNM', 'angath', 'TODO',
       CAST(strftime('%s','now') AS INTEGER) * 1000,
       CAST(strftime('%s','now') AS INTEGER) * 1000
FROM "_taxes_target" g;

DROP TABLE "_taxes_target";
