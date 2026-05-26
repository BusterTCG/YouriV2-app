/**
 * Debug script — dump l'état des deals et de leurs Management Fees pour
 * comprendre rapidement un état "en cours" / "encaissé" qui ne colle pas
 * avec ce qui est affiché sur la page `/deals/management-fees`.
 *
 * Usage : npx tsx scripts/check-mf-state.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

(async () => {
  const deals = await prisma.deal.findMany({
    where: { deletedAt: null },
    include: {
      managementFees: { where: { deletedAt: null } },
      dealArtistes: {
        where: { deletedAt: null },
        select: { paymentStatus: true },
      },
      dealCharges: {
        where: { deletedAt: null },
        select: { paymentStatus: true },
      },
    },
    orderBy: { date: "asc" },
  });
  for (const d of deals) {
    console.log("─".repeat(60));
    console.log("Title:", d.title);
    console.log("Date:", d.date.toISOString().slice(0, 10));
    console.log("DealStatus:", d.status);
    console.log("BudgetPaymentStatus:", d.budgetPaymentStatus);
    console.log(
      "BudgetPaidAt:",
      d.budgetPaidAt?.toISOString().slice(0, 10) ?? "—",
    );
    console.log(
      "Artistes statuses:",
      d.dealArtistes.map((a) => a.paymentStatus),
    );
    console.log(
      "Charges statuses:",
      d.dealCharges.map((c) => c.paymentStatus),
    );
    console.log("MF count:", d.managementFees.length);
    for (const mf of d.managementFees) {
      console.log(
        `  MF: ${mf.associateKey} ${mf.role} share=${mf.sharePct}% amount=${mf.amount} status=${mf.paymentStatus} paidAt=${mf.paidAt?.toISOString().slice(0, 10) ?? "—"}`,
      );
    }
  }
  await prisma.$disconnect();
})();
