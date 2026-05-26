/**
 * Seed Prisma — Youri V2
 *
 * Sprint 0 : AppSetting bootstrap.
 * Sprint 1 : 3 users (Stan ADMIN, Certe MEMBER, Angath MEMBER) avec mdp bcrypt.
 *
 * Le mdp initial = APP_PASSWORD env var (cf. .env.local). Chaque user peut le
 * changer plus tard via /settings/users (ADMIN reset) ou via un futur écran
 * "mon profil" (Sprint ultérieur).
 *
 * Idempotent : `upsert` partout, peut être rerun sans casser les données
 * existantes (sauf les champs `update:` qui sont remis à jour).
 */
import {
  PrismaClient,
  UserRole,
  DealCategory,
  DealStatus,
  PaymentStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { slugify } from "../lib/slug";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD =
  process.env.APP_PASSWORD ?? "ChangeMeBeforeProd2026";

const USERS = [
  {
    email: "stan@pangeeprod.com",
    name: "Stan",
    role: UserRole.ADMIN,
    color: "#7c3aed", // violet
    pangeeKey: "stan",
  },
  {
    email: "certe@pangeeprod.com",
    name: "Certe",
    role: UserRole.MEMBER,
    color: "#0ea5e9", // bleu cyan
    pangeeKey: "certe",
  },
  {
    email: "angath@pangeeprod.com",
    name: "Angath",
    role: UserRole.MEMBER,
    color: "#f59e0b", // amber
    pangeeKey: "angath",
  },
] as const;

/**
 * 3 artistes d'exemple pour Sprint 2 — Stan pourra les renommer / supprimer
 * via /artistes. Couleurs pré-choisies pour des badges agréables.
 */
// Couleur unique Pangee — cf. lib/artists-constants.ts + règle Stan 2026-05-26.
const PANGEE_ARTIST_COLOR = "#2563eb";

const ARTISTS = [
  { name: "Artiste Test 1" },
  { name: "Artiste Test 2" },
  { name: "Artiste Test 3" },
] as const;

async function main() {
  console.log("🌱 Seed Youri V2");

  // ─── AppSetting bootstrap ───
  await prisma.appSetting.upsert({
    where: { key: "bootstrap-version" },
    update: { value: "0.3.0" }, // bump Sprint 2
    create: { key: "bootstrap-version", value: "0.3.0" },
  });
  console.log("  ✓ AppSetting bootstrap-version");

  // ─── 3 artistes d'exemple (idempotent par name unique) ───
  // Règle métier Pangee : à la création d'un artiste, le `name` est
  // automatiquement utilisé comme `stageName` du ArtistProfile (cf.
  // createArtist côté server action). On reproduit la même chose au seed.
  //
  // Backfill couleur Pangee : on FORCE color=PANGEE_ARTIST_COLOR au seed
  // (update + create), pour aligner les artistes legacy (anciennes
  // couleurs pink/emerald/orange) avec la règle 2026-05-26 (couleur unique).
  for (const artist of ARTISTS) {
    const created = await prisma.artist.upsert({
      where: { name: artist.name },
      update: { color: PANGEE_ARTIST_COLOR },
      create: {
        name: artist.name,
        slug: slugify(artist.name),
        color: PANGEE_ARTIST_COLOR,
      },
      select: { id: true },
    });
    // Profile idempotent — pré-rempli avec stageName = name s'il n'existe
    // pas. Si l'user a déjà customisé le profile, on ne touche à rien.
    await prisma.artistProfile.upsert({
      where: { artistId: created.id },
      update: {},
      create: { artistId: created.id, stageName: artist.name },
    });
    console.log(`  ✓ Artist ${artist.name} (+ profile stageName)`);
  }

  // ─── 3 users ───
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      // En update on ne touche PAS au mdp (l'user a pu le changer après seed
      // initial). On met juste à jour les méta-données système.
      update: {
        name: user.name,
        role: user.role,
        color: user.color,
        active: true,
        pangeeKey: user.pangeeKey,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        color: user.color,
        passwordHash,
        pangeeKey: user.pangeeKey,
      },
    });
    console.log(`  ✓ User ${user.name} (${user.role})`);
  }

  // ─── Sprint 3 : 3 deals Booking d'exemple (idempotent par titre + skip si déjà seedés) ───
  // Permet à Stan de tester la liste / les filtres / le calcul de KPIs dès le
  // démarrage Phase 3.4. Seed-only : skipper si Stan a déjà créé des deals.
  const existingDeals = await prisma.deal.count();
  if (existingDeals === 0) {
    const [a1, a2, a3] = await prisma.artist.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: 3,
      select: { id: true, name: true },
    });
    const stan = await prisma.user.findUnique({
      where: { email: "stan@pangeeprod.com" },
      select: { id: true },
    });

    if (a1 && a2 && stan) {
      // Deal 1 — Booking simple, 1 artiste, LEAD
      // Budget 2000 € → Artiste 1500 € (75 %) + Charges 100 € = Marge 400 €
      await prisma.deal.create({
        data: {
          category: DealCategory.BOOKING,
          status: DealStatus.LEAD,
          title: `${a1.name} @ Comedy Club Paris`,
          date: new Date("2026-09-15T20:00:00Z"),
          showTime: "20:30",
          organizerName: "Comedy Production SARL",
          organizerCompany: "Comedy Production SARL",
          organizerCity: "Paris",
          venueName: "Comedy Club",
          venueCity: "Paris",
          createdById: stan.id,
          notes: "Date à confirmer après accord cachet.",
          budgetAmount: 2000,
          budgetPaymentStatus: PaymentStatus.N_A,
          dealArtistes: {
            create: [
              {
                artistId: a1.id,
                cachetAmount: 1500,
                sharePct: 75,
                paymentStatus: PaymentStatus.N_A,
              },
            ],
          },
          dealCharges: {
            create: [
              { label: "Frais déplacement", amount: 100, paymentStatus: PaymentStatus.N_A },
            ],
          },
        },
      });

      // Deal 2 — Plateau multi-artiste, CONFIRME, budget encaissé, paiements mixtes
      // Budget 3000 € → A1 1200 € (40 %) + A2 800 € (27 %) + Charges 250 € = Marge 750 €
      await prisma.deal.create({
        data: {
          category: DealCategory.BOOKING,
          status: DealStatus.CONFIRME,
          title: `Plateau Pangee × Bordeaux`,
          date: new Date("2026-11-20T20:30:00Z"),
          showTime: "20:30",
          organizerName: "Le Festival du Rire",
          organizerCompany: "Festival du Rire SAS",
          organizerCity: "Bordeaux",
          venueName: "Estrade",
          venueCity: "Bordeaux",
          createdById: stan.id,
          budgetAmount: 3000,
          budgetPaymentStatus: PaymentStatus.PAID,
          budgetPaidAt: new Date("2026-12-01T12:00:00Z"),
          dealArtistes: {
            create: [
              {
                artistId: a1.id,
                cachetAmount: 1200,
                sharePct: 40,
                paymentStatus: PaymentStatus.PAID,
                paidAt: new Date("2026-12-01T12:00:00Z"),
              },
              {
                artistId: a2.id,
                cachetAmount: 800,
                sharePct: 27,
                paymentStatus: PaymentStatus.INVOICED,
              },
            ],
          },
          dealCharges: {
            create: [
              { label: "Train Paris-Bordeaux", amount: 180, paymentStatus: PaymentStatus.PAID, paidAt: new Date("2026-11-15T12:00:00Z") },
              { label: "Repas équipe", amount: 70, paymentStatus: PaymentStatus.TO_INVOICE },
            ],
          },
        },
      });

      // Deal 3 — ANNULE (pour tester le filtre "non annulés")
      if (a3) {
        await prisma.deal.create({
          data: {
            category: DealCategory.BOOKING,
            status: DealStatus.ANNULE,
            title: `${a3.name} @ Festival annulé`,
            date: new Date("2026-07-10T19:00:00Z"),
            showTime: "19:00",
            organizerName: "Festival d'Été",
            organizerCity: "Lille",
            venueName: "Spotlight",
            venueCity: "Lille",
            createdById: stan.id,
            notes: "Annulé par l'organisateur (problème de financement).",
            budgetAmount: 1200,
            budgetPaymentStatus: PaymentStatus.N_A,
            dealArtistes: {
              create: [
                {
                  artistId: a3.id,
                  cachetAmount: 900,
                  sharePct: 75,
                  paymentStatus: PaymentStatus.N_A,
                },
              ],
            },
          },
        });
      }

      console.log(`  ✓ 3 deals Booking d'exemple créés`);
    }
  } else {
    console.log(`  ⊘ Deals déjà présents (${existingDeals}) — skip seed deals`);
  }

  console.log("✅ Seed terminé");
  console.log(
    `\nℹ Mdp initial pour les 3 users : APP_PASSWORD du .env (= "${DEFAULT_PASSWORD.slice(0, 4)}…").`,
  );
  console.log(
    "ℹ Au prochain login, change le mdp via /settings/users (ADMIN).\n",
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed échoué", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
