// Génère les icônes PWA + Apple Touch à partir du logo source Youri.
// Source : Logo/V2_1.png (samouraï Youri, gris foncé sur fond transparent)
// Sortie : public/icon-180.png, icon-192.png, icon-512.png, icon-1024.png,
//          apple-touch-icon.png, favicon-32.png, logo-mark.png
//
// Stratégie (alignée KN scripts/generate-icons.mjs) :
//   - Le logo a un fond transparent → on l'aplatit sur fond blanc dans un
//     carré 1024x1024 avec padding 10% (le samouraï ne touche pas les bords,
//     meilleur rendu iOS).
//   - Variant `logo-mark.png` sans padding additionnel pour usage in-app
//     (sidebar / mobile-nav à 28-32px).
//
// Run : node scripts/generate-icons.mjs

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const SRC = resolve("Logo/V2_1.png");
const OUT_DIR = resolve("public");

await mkdir(OUT_DIR, { recursive: true });

// 1. Master 1024x1024 avec padding blanc 10%
//    900x900 contain (preserve ratio) + extend 62px chaque côté = 1024x1024
const master = await sharp(SRC)
  .resize(900, 900, {
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({
    top: 62,
    bottom: 62,
    left: 62,
    right: 62,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png()
  .toBuffer();

// 2. Generate all sizes from the master
const sizes = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-180.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-1024.png", size: 1024 },
];

for (const { name, size } of sizes) {
  await sharp(master).resize(size, size).png().toFile(resolve(OUT_DIR, name));
  console.log(`✓ ${name} (${size}x${size})`);
}

// 3. Favicon 32x32
await sharp(master)
  .resize(32, 32)
  .png()
  .toFile(resolve(OUT_DIR, "favicon-32.png"));
console.log("✓ favicon-32.png (32x32)");

// 4. Logo-mark : variante sans padding pour l'affichage in-app.
//    Sidebar + mobile-nav rendent à 28-32px, le padding 6% des icônes PWA
//    rendrait le logo illisible. Ici on garde le ratio original.
const logoMark = await sharp(SRC)
  .resize(1024, 1024, {
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toBuffer();
await sharp(logoMark).resize(128, 128).png().toFile(resolve(OUT_DIR, "logo-mark.png"));
console.log("✓ logo-mark.png (128x128, no padding)");

console.log("\n✅ Done. Icônes Youri générées dans public/");
