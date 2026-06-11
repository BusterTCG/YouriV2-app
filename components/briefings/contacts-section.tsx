"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  UserSearch,
  Users2,
} from "lucide-react";
import type { BriefingRole } from "@prisma/client";
import { PANGEE_TEAM, PANGEE_COMPANY } from "@/lib/pangee-team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactPicker, type ContactSnapshot } from "@/components/deals/contact-picker";
import { cn } from "@/lib/utils";
import { formatPhone, phoneHref } from "@/lib/format-phone";
import {
  addBriefingContact,
  addBriefingInlineContact,
  removeBriefingContact,
} from "@/lib/actions/briefings";

/**
 * Section Contacts FDR — Lot B3 (copie fidèle KN ContactsList +
 * NewContactRow + NewInlineContactRow, adapté Pangee).
 *
 * Différence vs KN : pas d'annuaire Contact local. On utilise le pattern
 * snapshot annuaire KN distant via le ContactPicker (combobox debounced
 * 250ms). Au moment de la sélection, on copie nom/société/téléphone/email
 * dans les champs inline du BriefingContact pour avoir des coordonnées
 * stables (refetch via kn-client si besoin de rafraîchir).
 *
 * 2 modes d'ajout :
 *   - "Depuis l'annuaire KN" → ContactPicker (snapshot avec contactId)
 *   - "Saisie ponctuelle" → form 4 champs (firstName/lastName/phone/company)
 *     pour les rôles jetables (runner, VTC du jour)
 */

export const ROLE_LABELS: Record<BriefingRole, string> = {
  PRODUCTION: "Production",
  REGISSEUR: "Régisseur",
  VTC: "VTC / Chauffeur",
  TOUR_MANAGER: "Tour manager",
  ORGANISATEUR: "Organisateur",
  TECHNICIEN: "Technicien",
  AUTRE: "Autre",
};

export type BriefingContactRow = {
  id: string;
  contactId: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  role: BriefingRole;
};

interface Props {
  briefingId: string;
  rows: BriefingContactRow[];
}

export function ContactsSection({ briefingId, rows }: Props) {
  // 2 modes d'ajout — l'utilisateur choisit lequel au moment d'ajouter :
  //   "linked" : depuis l'annuaire KN (snapshot)
  //   "inline" : saisie ponctuelle (runner, VTC du jour…)
  const [addingMode, setAddingMode] = useState<
    null | "linked" | "inline" | "pangee"
  >(null);
  const [, startTransition] = useTransition();

  function remove(id: string) {
    if (!confirm("Supprimer ce contact ?")) return;
    startTransition(async () => {
      await removeBriefingContact(id);
    });
  }

  // Stan 2026-05-26 : les membres Pangee Prod apparaissent en premier
  // dans la liste (identifiés par company === PANGEE_COMPANY). Tri stable
  // — l'ordre relatif au sein des 2 groupes (Pangee / autres) est préservé.
  const sortedRows = [...rows].sort((a, b) => {
    const aPangee = a.company === PANGEE_COMPANY ? 0 : 1;
    const bPangee = b.company === PANGEE_COMPANY ? 0 : 1;
    return aPangee - bPangee;
  });

  return (
    <div className="space-y-2">
      {sortedRows.length === 0 && !addingMode && (
        <p className="text-sm text-muted-foreground italic">
          Aucun contact ajouté.
        </p>
      )}

      {sortedRows.map((r) => {
        const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.company || "—";
        const isInline = r.contactId == null;
        return (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm flex-wrap"
          >
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border rounded px-1.5 py-0.5">
              {ROLE_LABELS[r.role]}
            </span>
            <span className="font-medium">{displayName}</span>
            {isInline && (
              <span
                className="text-[10px] uppercase tracking-wider text-yr-gold border border-yr-gold/40 rounded px-1.5 py-0.5"
                title="Contact ponctuel — non enregistré dans l'annuaire KN"
              >
                Ponctuel
              </span>
            )}
            {r.company && (
              <span className="text-xs text-muted-foreground">
                · {r.company}
              </span>
            )}
            {r.phone && (
              <a
                href={`tel:${phoneHref(r.phone)}`}
                className="text-xs text-blue-600 hover:underline tabular-nums"
              >
                {formatPhone(r.phone)}
              </a>
            )}
            {/* Email retiré de la FDR (Stan 2026-05-26) — toujours stocké
                en DB mais pas affiché côté UI ni print. */}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => remove(r.id)}
              title="Supprimer ce contact"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}

      {addingMode === "linked" && (
        <NewKnContactRow
          briefingId={briefingId}
          existingContactIds={
            new Set(rows.map((r) => r.contactId).filter((x): x is string => !!x))
          }
          onCancel={() => setAddingMode(null)}
          onCreated={() => setAddingMode(null)}
        />
      )}
      {addingMode === "inline" && (
        <NewInlineContactRow
          briefingId={briefingId}
          onCancel={() => setAddingMode(null)}
          onCreated={() => setAddingMode(null)}
        />
      )}
      {addingMode === "pangee" && (
        <NewPangeeContactRow
          briefingId={briefingId}
          onCancel={() => setAddingMode(null)}
          onCreated={() => setAddingMode(null)}
        />
      )}

      {!addingMode && (
        <div className="flex flex-wrap gap-2">
          {/* Stan 2026-05-26 : Équipe Pangee en premier (action la plus
              fréquente — on a presque toujours un membre Pangee sur la FDR). */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddingMode("pangee")}
            title="Ajouter un membre de l'équipe Pangee (Stan / Certe / Angath)"
          >
            <Users2 className="h-3.5 w-3.5 mr-1.5" />
            Équipe Pangee
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddingMode("linked")}
          >
            <UserSearch className="h-3.5 w-3.5 mr-1.5" />
            Depuis l&apos;annuaire KN
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddingMode("inline")}
            title="Pour un contact ponctuel (runner, VTC…) — pas enregistré dans l'annuaire"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Saisie ponctuelle (runner, VTC…)
          </Button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── NewKnContactRow (annuaire KN) ────────────────────────────

function NewKnContactRow({
  briefingId,
  existingContactIds,
  onCancel,
  onCreated,
}: {
  briefingId: string;
  /** IDs contactId KN déjà rattachés à la FDR — sert à éviter doublons. */
  existingContactIds: Set<string>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<BriefingRole>("PRODUCTION");
  const [contact, setContact] = useState<ContactSnapshot | null>(null);

  function submit() {
    if (!contact) return;
    if (existingContactIds.has(contact.id)) {
      alert("Ce contact est déjà sur la FDR.");
      return;
    }
    startTransition(async () => {
      // Décompose le name complet en firstName / lastName (best-effort).
      // Le ContactPicker assemble déjà via "firstName + lastName".
      const parts = contact.name.trim().split(/\s+/);
      const firstName = parts.length > 1 ? parts[0] : null;
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];

      const res = await addBriefingContact({
        briefingId,
        contactId: contact.id,
        firstName,
        lastName,
        company: contact.company,
        // Phone/email snapshottés depuis le ContactPicker (Stan 2026-05-26)
        phone: contact.phone ?? null,
        email: contact.email ?? null,
        role,
      });
      if (res.ok) onCreated();
    });
  }

  return (
    <div className="rounded-md border-2 border-yr-gold/30 bg-yr-gold/5 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-yr-gold font-semibold">
        Depuis l&apos;annuaire KN
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Rôle">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as BriefingRole)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as BriefingRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Contact">
          <ContactPicker value={contact} onChange={setContact} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button size="sm" onClick={submit} disabled={pending || !contact}>
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Ajouter
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────── NewInlineContactRow (saisie ponctuelle) ────────────────────────────

function NewInlineContactRow({
  briefingId,
  onCancel,
  onCreated,
}: {
  briefingId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<BriefingRole>("VTC");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");

  function submit() {
    if (!firstName.trim()) return;
    startTransition(async () => {
      const res = await addBriefingInlineContact({
        briefingId,
        role,
        firstName,
        lastName: lastName || null,
        phone: phone || null,
        company: company || null,
      });
      if (res.ok) onCreated();
    });
  }

  return (
    <div className="rounded-md border-2 border-yr-gold/30 bg-yr-gold/5 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-yr-gold font-semibold flex items-center gap-1.5">
        Saisie ponctuelle
        <span className="text-muted-foreground/80 normal-case font-normal italic">
          — pas enregistré dans l&apos;annuaire KN
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Field label="Rôle">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as BriefingRole)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as BriefingRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Prénom *">
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Nom">
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Téléphone">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="06 xx xx xx xx"
            className="h-8 text-sm"
          />
        </Field>
      </div>
      <Field label="Société / agence (optionnel)">
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder=""
          className="h-8 text-sm"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={submit}
          disabled={pending || !firstName.trim()}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Ajouter
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────── NewPangeeContactRow (équipe Pangee) ────────────────────────────

/**
 * Ajout rapide d'un membre de l'équipe Pangee (Stan / Certe / Angath) avec
 * leur numéro pré-rempli depuis lib/pangee-team.ts. Stan 2026-05-26.
 *
 * Comportement : l'utilisateur choisit un membre + un rôle, le tel et la
 * company "Pangee Prod" sont injectés automatiquement. Persistance en mode
 * "inline" côté DB (contactId = null) car ces 3 personnes ne sont pas dans
 * l'annuaire KN.
 */
function NewPangeeContactRow({
  briefingId,
  onCancel,
  onCreated,
}: {
  briefingId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [memberKey, setMemberKey] = useState<string>(PANGEE_TEAM[0]?.key ?? "");
  const member = PANGEE_TEAM.find((m) => m.key === memberKey);
  const [role, setRole] = useState<BriefingRole>(
    member?.defaultRole ?? "PRODUCTION",
  );
  const [phoneOverride, setPhoneOverride] = useState<string>(
    member?.phone ?? "",
  );

  function onChangeMember(k: string) {
    setMemberKey(k);
    const m = PANGEE_TEAM.find((x) => x.key === k);
    if (m) {
      setRole(m.defaultRole);
      setPhoneOverride(m.phone);
    }
  }

  function submit() {
    if (!member) return;
    startTransition(async () => {
      const res = await addBriefingInlineContact({
        briefingId,
        role,
        firstName: member.firstName,
        lastName: member.lastName || null,
        phone: phoneOverride || null,
        company: PANGEE_COMPANY,
      });
      if (res.ok) onCreated();
    });
  }

  return (
    <div className="rounded-md border-2 border-yr-gold/30 bg-yr-gold/5 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-yr-gold font-semibold flex items-center gap-1.5">
        <Users2 className="h-3 w-3" />
        Équipe Pangee
        <span className="text-muted-foreground/80 normal-case font-normal italic">
          — membre Pangee Prod (Stan / Certe / Angath)
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Membre">
          <Select value={memberKey} onValueChange={onChangeMember}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PANGEE_TEAM.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.firstName}
                  {m.lastName ? ` ${m.lastName}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Rôle sur la FDR">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as BriefingRole)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as BriefingRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Téléphone">
          <Input
            type="tel"
            value={phoneOverride}
            onChange={(e) => setPhoneOverride(e.target.value)}
            className="h-8 text-sm"
          />
        </Field>
      </div>
      <p className="text-[11px] text-muted-foreground italic">
        💡 Pour modifier les numéros par défaut Stan / Certe / Angath, édite{" "}
        <code className="bg-muted/60 px-1 rounded">lib/pangee-team.ts</code>.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button size="sm" onClick={submit} disabled={pending || !member}>
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Ajouter
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────── Field local ────────────────────────────

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
