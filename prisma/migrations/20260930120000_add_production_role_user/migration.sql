-- Profil « Production » (portage du profil Nour de KuroNeko-App, Stan
-- 2026-09-30) : UserRole gagne la valeur PRODUCTION (enum = TEXT en SQLite,
-- aucune modification de table) et le compte booking@pangeeprod.com est créé
-- pour Nour, externe aux associés (accès limité : lib/auth/roles.ts).
--
-- Connexion Google (ajouter l'email à AUTH_ALLOWED_EMAILS sur le serveur).
-- Mot de passe de secours : hash d'un secret aléatoire jeté → inutilisable
-- tant que Stan n'en définit pas un depuis Réglages → Utilisateurs.
INSERT INTO "User" ("id", "email", "name", "passwordHash", "color", "role", "active", "pangeeKey", "createdAt", "updatedAt")
SELECT 'usr' || lower(hex(randomblob(11))), 'booking@pangeeprod.com', 'Nour',
       '$2b$10$0D1ugOGoP8OHm9cLj8h4U.1rjhIABE6D1jOwT2x/Olopi7wqSmYoi', '#ec4899', 'PRODUCTION', 1, 'nour',
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "email" = 'booking@pangeeprod.com');
