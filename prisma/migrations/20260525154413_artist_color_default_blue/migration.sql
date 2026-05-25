-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "avatarUrl" TEXT,
    "avatarPositionX" REAL NOT NULL DEFAULT 50,
    "avatarPositionY" REAL NOT NULL DEFAULT 50,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Artist" ("active", "avatarPositionX", "avatarPositionY", "avatarUrl", "color", "createdAt", "deletedAt", "id", "name", "notes", "slug", "updatedAt") SELECT "active", "avatarPositionX", "avatarPositionY", "avatarUrl", "color", "createdAt", "deletedAt", "id", "name", "notes", "slug", "updatedAt" FROM "Artist";
DROP TABLE "Artist";
ALTER TABLE "new_Artist" RENAME TO "Artist";
CREATE UNIQUE INDEX "Artist_name_key" ON "Artist"("name");
CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
