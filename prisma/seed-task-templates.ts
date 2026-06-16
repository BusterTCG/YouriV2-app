/**
 * Seed des TaskTemplate par défaut — Sprint 6 (Stan 2026-05-31, repris V1).
 *
 * Reprend les templates de Youri V1 (Vercel) :
 *   - BOOKING_TACHES_DEFAULT      (5 étapes)
 *   - INTERMITTENCE_TACHES_DEFAULT → CACHETS (6 étapes)
 *   - PROD_EXE_TACHES_DEFAULT     (7 étapes)
 *
 * Source : `youri-app/lib/db.ts` lignes 76-82, 121-128, 172-180.
 *
 * Assignation (Stan 2026-06-11 audit) : la 1re étape de chaque pipeline est
 * attribuée à "stan" par défaut, pour qu'un nouveau deal soit immédiatement
 * visible dans /taches (sinon pipeline 100% non attribué = deal invisible
 * partout, le seul filet étant la section "À attribuer"). Les étapes suivantes
 * restent `null` — assignées au cas par cas, ou captées par "À attribuer".
 * Stan affine tout depuis /settings/templates.
 * dueOffsets laissés à `null` (feature retirée de l'UI).
 *
 * Usage :
 *   npx tsx prisma/seed-task-templates.ts          → skip si templates existent
 *   npx tsx prisma/seed-task-templates.ts --force  → wipe + recrée tout
 */
import { PrismaClient, type DealCategory } from "@prisma/client";

const prisma = new PrismaClient();

interface TemplateSeed {
  order: number;
  label: string;
  defaultAssigneeKey?: string | null;
  defaultDueOffsetDays?: number | null;
}

// Assignations par défaut définies par Stan (config prod 2026-06-16).
// Clés = pangeeKey : "stan", "angath" (= admin@pangeeprod.com), null = non assigné.
const TEMPLATES: Record<DealCategory, TemplateSeed[]> = {
  BOOKING: [
    { order: 0, label: "Validation du projet" },
    { order: 1, label: "Validation des artistes" },
    { order: 2, label: "Envoi du devis", defaultAssigneeKey: "angath" },
    { order: 3, label: "Envoi de FDR" },
    { order: 4, label: "Envoi de Facture", defaultAssigneeKey: "angath" },
  ],
  PROD_EXE: [
    { order: 0, label: "Validation date", defaultAssigneeKey: "stan" },
    { order: 1, label: "Signature du contrat", defaultAssigneeKey: "stan" },
    { order: 2, label: "Mise en ligne" },
    { order: 3, label: "Gestion VHR" },
    { order: 4, label: "Envoie FDR" },
    { order: 5, label: "Envoie Facture" },
    { order: 6, label: "Paiement Artiste", defaultAssigneeKey: "angath" },
  ],
  CACHETS: [
    { order: 0, label: "Validation du montant Artiste", defaultAssigneeKey: "angath" },
    { order: 1, label: "Validation du Moovin Motion Artiste", defaultAssigneeKey: "angath" },
    { order: 2, label: "Envoi de la facture Artiste", defaultAssigneeKey: "angath" },
    { order: 3, label: "Paiement Artiste de la facture", defaultAssigneeKey: "angath" },
    { order: 4, label: "Emission du cachet", defaultAssigneeKey: "angath" },
    { order: 5, label: "Paiement du cachet", defaultAssigneeKey: "angath" },
  ],
};

async function main() {
  const force = process.argv.includes("--force");

  if (force) {
    console.log("⚠️  --force : suppression des TaskTemplate existants…");
    // Hard delete pour éviter de polluer avec des soft-deleted.
    const deleted = await prisma.taskTemplate.deleteMany({});
    console.log(`   ↳ ${deleted.count} templates supprimés.\n`);
  }

  let total = 0;
  for (const [category, templates] of Object.entries(TEMPLATES) as Array<
    [DealCategory, TemplateSeed[]]
  >) {
    const existing = await prisma.taskTemplate.count({
      where: { category, deletedAt: null },
    });
    if (existing > 0 && !force) {
      console.log(
        `⏭️  ${category} : ${existing} templates déjà présents — skip. (--force pour remplacer)`,
      );
      continue;
    }
    await prisma.taskTemplate.createMany({
      data: templates.map((t) => ({
        category,
        order: t.order,
        label: t.label,
        defaultAssigneeKey: t.defaultAssigneeKey ?? null,
        defaultDueOffsetDays: t.defaultDueOffsetDays ?? null,
      })),
    });
    console.log(`✅ ${category} : ${templates.length} templates créés.`);
    total += templates.length;
  }
  console.log(`\n🎯 Seed terminé — ${total} TaskTemplate créés au total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
