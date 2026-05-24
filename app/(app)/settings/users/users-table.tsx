"use client";

import { useState, useTransition } from "react";
import type { UserRole, AuthSource } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetUserPassword, toggleUserActive } from "@/lib/actions/users";
import { formatFr } from "@/lib/dates";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  color: string;
  active: boolean;
  lastAuthSource: AuthSource | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function UsersTable({
  users,
  currentAdminId,
}: {
  users: UserRow[];
  currentAdminId: string;
}) {
  return (
    <div className="space-y-3">
      {users.map((user) => (
        <UserRowItem
          key={user.id}
          user={user}
          isSelf={user.id === currentAdminId}
        />
      ))}
    </div>
  );
}

function UserRowItem({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const initials = user.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await resetUserPassword({ userId: user.id, newPassword });
      if (res.ok) {
        setFeedback({ type: "ok", msg: "Mot de passe réinitialisé" });
        setNewPassword("");
        setShowReset(false);
      } else {
        setFeedback({ type: "error", msg: res.error });
      }
    });
  }

  function handleToggle() {
    setFeedback(null);
    startTransition(async () => {
      const res = await toggleUserActive({ userId: user.id, active: !user.active });
      if (!res.ok) {
        setFeedback({ type: "error", msg: res.error });
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: user.color }}
          >
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{user.name}</p>
              <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">
                {user.role}
              </span>
              {!user.active && (
                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  Désactivé
                </span>
              )}
              {isSelf && (
                <span className="rounded bg-accent/20 px-2 py-0.5 text-xs">
                  Toi
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user.lastLoginAt
                ? `Dernière connexion ${formatFr(user.lastLoginAt, "short")} via ${user.lastAuthSource ?? "—"}`
                : "Jamais connecté"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReset((v) => !v)}
            disabled={isPending}
          >
            {showReset ? "Annuler" : "Réinit. mdp"}
          </Button>
          <Button
            variant={user.active ? "outline" : "default"}
            size="sm"
            onClick={handleToggle}
            disabled={isPending || (isSelf && user.active)}
            title={
              isSelf && user.active
                ? "Tu ne peux pas te désactiver toi-même"
                : undefined
            }
          >
            {user.active ? "Désactiver" : "Réactiver"}
          </Button>
        </div>
      </div>

      {showReset && (
        <form onSubmit={handleReset} className="mt-4 flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor={`pwd-${user.id}`} className="text-xs">
              Nouveau mot de passe (8 caractères minimum)
            </Label>
            <Input
              id={`pwd-${user.id}`}
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Saisi par l'admin, à transmettre à l'user"
              autoComplete="new-password"
              disabled={isPending}
            />
          </div>
          <Button type="submit" size="sm" disabled={isPending || newPassword.length < 8}>
            {isPending ? "…" : "Enregistrer"}
          </Button>
        </form>
      )}

      {feedback && (
        <p
          className={`mt-2 text-xs ${
            feedback.type === "ok" ? "text-green-600 dark:text-green-400" : "text-destructive"
          }`}
        >
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
