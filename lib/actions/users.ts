"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/users";
import { safeAction, type ActionResult } from "@/lib/errors";

/**
 * Server actions ADMIN-only pour la gestion des 3 users Pangee Prod.
 *
 * Chaque action commence par `await requireAdmin()` → garde de sécurité côté
 * serveur. NE PAS s'appuyer sur le client (toujours doubler la vérif).
 */

// ─────────── Reset mot de passe ───────────

const ResetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Le mot de passe doit faire 8 caractères minimum")
    .max(128, "Le mot de passe est trop long (max 128)"),
});

export async function resetUserPassword(
  input: z.infer<typeof ResetPasswordSchema>,
): Promise<ActionResult> {
  return safeAction("resetUserPassword", async () => {
    await requireAdmin();
    const { userId, newPassword } = ResetPasswordSchema.parse(input);

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });

    revalidatePath("/settings/users");
  });
}

// ─────────── Toggle active ───────────

const ToggleActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
});

export async function toggleUserActive(
  input: z.infer<typeof ToggleActiveSchema>,
): Promise<ActionResult> {
  return safeAction("toggleUserActive", async () => {
    const admin = await requireAdmin();
    const { userId, active } = ToggleActiveSchema.parse(input);

    // Empêche l'admin de se désactiver lui-même (sinon plus aucun ADMIN sur
    // l'app — galère pour restaurer).
    if (userId === admin.id && !active) {
      throw new Error(
        "Tu ne peux pas te désactiver toi-même — demande à un autre ADMIN.",
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { active },
    });

    revalidatePath("/settings/users");
  });
}
