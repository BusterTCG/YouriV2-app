-- Voyageurs par trajet FDR (Stan 2026-10-05) : artistes du deal cochés
-- + noms libres. JSON nullable, null = tout le monde.
ALTER TABLE "BriefingTravel" ADD COLUMN "travelers" JSONB;
