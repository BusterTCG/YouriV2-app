-- Avance de trésorerie de l'artiste (Stan 2026-10-12) : lien vers le
-- versement qui l'a rendue. Enum ArtistMovementKind : CASH_ADVANCE (SQLite = TEXT).
ALTER TABLE "ArtistMovement" ADD COLUMN "repaidById" TEXT REFERENCES "ArtistMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
