-- CreateTable
CREATE TABLE "ArtistProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artistId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "stageName" TEXT,
    "birthDate" DATETIME,
    "birthPlace" TEXT,
    "nationality" TEXT,
    "socialSecurityNumber" TEXT,
    "intermittentNumber" TEXT,
    "sacdNumber" TEXT,
    "personalEmail" TEXT,
    "personalPhone" TEXT,
    "homeAddress" TEXT,
    "companyName" TEXT,
    "companyLegalForm" TEXT,
    "companySiret" TEXT,
    "companySiren" TEXT,
    "companyVatNumber" TEXT,
    "companyApeCode" TEXT,
    "companyAddress" TEXT,
    "spectacleLicense" TEXT,
    "vatRegime" TEXT,
    "bankIban" TEXT,
    "bankBic" TEXT,
    "bankName" TEXT,
    "bankHolder" TEXT,
    "bioShort" TEXT,
    "bioLong" TEXT,
    "pressPhotoUrl" TEXT,
    "websiteUrl" TEXT,
    "instagramHandle" TEXT,
    "youtubeHandle" TEXT,
    "tiktokHandle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArtistProfile_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "avatarUrl" TEXT,
    "avatarPositionX" REAL NOT NULL DEFAULT 50,
    "avatarPositionY" REAL NOT NULL DEFAULT 50,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Artist" ("active", "color", "createdAt", "deletedAt", "id", "name", "notes", "slug", "updatedAt") SELECT "active", "color", "createdAt", "deletedAt", "id", "name", "notes", "slug", "updatedAt" FROM "Artist";
DROP TABLE "Artist";
ALTER TABLE "new_Artist" RENAME TO "Artist";
CREATE UNIQUE INDEX "Artist_name_key" ON "Artist"("name");
CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ArtistProfile_artistId_key" ON "ArtistProfile"("artistId");
