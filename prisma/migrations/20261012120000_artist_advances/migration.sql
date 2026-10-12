-- Frais avancés par l'artiste (Stan 2026-10-12) : flag sur les charges des
-- dates et les frais généraux + lien vers le versement qui les rembourse.
-- Enum ArtistMovementKind : EXPENSES (SQLite = TEXT, pas de DDL).
ALTER TABLE "ArtistMovement" ADD COLUMN "advanceAmount" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "ProductionLine" ADD COLUMN "paidByArtist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductionLine" ADD COLUMN "artistRefundId" TEXT REFERENCES "ArtistMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOverhead" ADD COLUMN "paidByArtist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductionOverhead" ADD COLUMN "artistRefundId" TEXT REFERENCES "ArtistMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
