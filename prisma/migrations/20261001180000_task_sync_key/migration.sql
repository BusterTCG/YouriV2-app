-- Lien fixe tâche ↔ check-list de la fiche date (Stan 2026-10-01, analyse
-- architecture point 3) : la synchro ne dépend plus du libellé de la tâche.
ALTER TABLE "Task" ADD COLUMN "syncKey" TEXT;
ALTER TABLE "TaskTemplate" ADD COLUMN "syncKey" TEXT;

-- Reprise : mêmes règles que l'ancienne reconnaissance par libellé
-- (lib/tasks-show-sync-utils.ts), dates de production uniquement.
UPDATE "TaskTemplate" SET "syncKey" = CASE
    WHEN lower("label") LIKE '%signature%' OR lower("label") LIKE '%contrat signé%' THEN 'contractSigned'
    WHEN lower("label") LIKE '%mise en ligne%' OR lower("label") LIKE '%billetterie%'
      OR lower("label") = 'mev' OR lower("label") LIKE 'mev %' OR lower("label") LIKE '% mev' OR lower("label") LIKE '% mev %' THEN 'ticketingReady'
    WHEN lower("label") = 'vhr' OR lower("label") LIKE 'vhr %' OR lower("label") LIKE '% vhr' OR lower("label") LIKE '% vhr %' THEN 'vhrBooked'
  END
WHERE "category" = 'PROD_EXE';

UPDATE "Task" SET "syncKey" = CASE
    WHEN lower("label") LIKE '%signature%' OR lower("label") LIKE '%contrat signé%' THEN 'contractSigned'
    WHEN lower("label") LIKE '%mise en ligne%' OR lower("label") LIKE '%billetterie%'
      OR lower("label") = 'mev' OR lower("label") LIKE 'mev %' OR lower("label") LIKE '% mev' OR lower("label") LIKE '% mev %' THEN 'ticketingReady'
    WHEN lower("label") = 'vhr' OR lower("label") LIKE 'vhr %' OR lower("label") LIKE '% vhr' OR lower("label") LIKE '% vhr %' THEN 'vhrBooked'
  END
WHERE "dealId" IN (SELECT "id" FROM "Deal" WHERE "category" = 'PROD_EXE');
