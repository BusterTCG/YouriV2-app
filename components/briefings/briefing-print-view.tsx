"use client";

import { useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Printer, ArrowLeft, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { BriefingRole, TravelDirection } from "@prisma/client";
import { formatPhone, phoneHref } from "@/lib/format-phone";
import { formatShowTime } from "@/components/deals/deal-helpers";

/**
 * Vue HTML print-ready de la FDR — Sprint 3.7 Lot C1.
 *
 * Copie fidèle KN briefing-print-view, adaptée Pangee multi-artiste :
 *   - Header navy/gold (mêmes hex que KN : #1a2540 + #d4a93a) qui liste
 *     TOUS les artistes du deal (Pangee est multi-artiste vs KN solo)
 *   - Sections : Spectacle / Trajets / Hébergement / Contacts / Notes
 *   - Toolbar à l'écran avec bouton "Imprimer / PDF" (masquée à l'impression)
 *   - Mode `previewMode` : pas d'auto-print au chargement (juste visualisation)
 *   - Mode normal : `window.print()` auto à 800ms du chargement
 *
 * Format A4 portrait, marges 0 (notre propre padding interne pour
 * repousser les en-têtes/pieds navigateur hors zone imprimable).
 */

const ROLE_LABELS: Record<BriefingRole, string> = {
  PRODUCTION: "Production",
  REGISSEUR: "Régisseur",
  VTC: "VTC / Chauffeur",
  TOUR_MANAGER: "Tour manager",
  ORGANISATEUR: "Organisateur",
  TECHNICIEN: "Technicien",
  AUTRE: "Autre",
};

interface DealMeta {
  title: string;
  date: Date;
  venueCity: string | null;
  /** Tous les artistes du deal (Pangee multi-artiste). */
  artists: Array<{ name: string; color: string }>;
}

interface BriefingDataPrint {
  showTime: string | null;
  balanceTime: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueAddress: string | null;
  capacity: number | null;
  hotelName: string | null;
  hotelAddress: string | null;
  restaurantName: string | null;
  restaurantAddress: string | null;
  restaurantCovered: boolean;
  perDiemFlag: boolean;
  perDiemAmount: number | null;
  notes: string | null;
  travels: Array<{
    direction: TravelDirection;
    date: Date;
    fromStation: string;
    fromTime: string;
    toStation: string;
    toTime: string;
    comment: string | null;
    runs: Array<{ location: string; time: string }>;
  }>;
  // Email retiré de la print-view (Stan 2026-05-26) — on garde le champ
  // côté contacts pour usage UI mais pas de colonne dans le table FDR.
  contacts: Array<{
    role: BriefingRole;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    phone: string | null;
  }>;
}

interface Props {
  dealId: string;
  deal: DealMeta;
  briefing: BriefingDataPrint | null;
  /** Si true, pas d'auto-print au chargement. */
  previewMode?: boolean;
}

export function BriefingPrintView({
  dealId,
  deal,
  briefing,
  previewMode = false,
}: Props) {
  // Auto-trigger print dialog 800ms après chargement (laisse le temps au rendu).
  // Skip si `previewMode=true` (param ?preview=1) → l'user reste sur l'aperçu.
  useEffect(() => {
    if (previewMode) return;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") window.print();
    }, 800);
    return () => clearTimeout(t);
  }, [previewMode]);

  const artistesStr =
    deal.artists.map((a) => a.name).join(", ") || "—";

  return (
    <>
      {/* Toolbar : visible à l'écran, masquée à l'impression */}
      <div className="print:hidden border-b bg-slate-100 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link
          href={`/deals/booking/${dealId}/fdr`}
          className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Retour à la FDR
        </Link>
        <span className="text-xs text-slate-500">
          {previewMode
            ? "Aperçu — clique sur « Imprimer » à droite quand tu es prêt."
            : "Aperçu impression — la fenêtre d'impression va s'ouvrir automatiquement."}
        </span>
        <span className="text-[11px] text-slate-500 italic ml-2">
          💡 Dans la fenêtre d&apos;impression, décoche{" "}
          <strong>« En-têtes et pieds de page »</strong> pour masquer
          l&apos;URL et la date du navigateur.
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-[#1a2540] text-white px-3 py-1.5 text-sm font-medium hover:bg-[#1a2540]/90"
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimer / Enregistrer en PDF
        </button>
      </div>

      <div className="print-document mx-auto bg-white">
        {/* Header bleu nuit + or — template Youri (mêmes hex que KN) */}
        <header className="bg-[#1a2540] text-white px-10 py-6 flex items-start justify-between print:break-after-avoid">
          <div className="min-w-0 flex-1 pr-4">
            <div className="text-[#d4a93a] uppercase text-[11px] tracking-[0.2em] font-bold mb-1">
              Pangee Prod
            </div>
            <h1 className="text-2xl font-bold leading-tight">
              Feuille de route
            </h1>
            <div className="text-white/80 text-sm mt-2">
              {artistesStr} · {deal.title}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[#d4a93a] uppercase text-[11px] tracking-[0.2em] font-bold mb-1">
              Date
            </div>
            <div className="text-base font-semibold">
              {format(deal.date, "EEEE d MMMM yyyy", { locale: fr })}
            </div>
            {briefing?.showTime ? (
              <div className="text-white text-base font-semibold tabular-nums mt-1">
                {formatShowTime(briefing.showTime)}
              </div>
            ) : (
              deal.venueCity && (
                <div className="text-white/80 text-sm mt-1">
                  {deal.venueCity}
                </div>
              )
            )}
          </div>
        </header>

        <main className="px-10 py-6 space-y-6">
          {/* SPECTACLE — Artistes / Salle / Adresse / (séparateur) / Heures */}
          <PrintSection title="Spectacle">
            <DefList>
              <DefItem
                emoji="🎤"
                label={deal.artists.length > 1 ? "Artistes" : "Artiste"}
                value={artistesStr}
              />
              <DefItem
                emoji="🏛️"
                label="Salle"
                value={briefing?.venueName || "—"}
              />
              <DefItem
                emoji="📍"
                label="Adresse"
                value={(() => {
                  const addr = smartJoinAddress(
                    briefing?.venueAddress,
                    briefing?.venueCity,
                  );
                  return addr ? <AddressWithGmaps address={addr} /> : "—";
                })()}
              />
              <DefItem
                emoji="👥"
                label="Jauge"
                value={
                  briefing?.capacity != null
                    ? `${briefing.capacity} places`
                    : "—"
                }
              />
              <li className="border-t border-slate-200 my-1" aria-hidden />
              <DefItem
                emoji="⚙️"
                label="Heure de balance"
                value={
                  briefing?.balanceTime
                    ? formatShowTime(briefing.balanceTime)
                    : "—"
                }
              />
              <DefItem
                emoji="🎬"
                label="Heure du show"
                value={
                  <span className="font-bold">
                    {briefing?.showTime ? formatShowTime(briefing.showTime) : "—"}
                  </span>
                }
              />
            </DefList>
          </PrintSection>

          {/* TRAJETS — cards visuelles aller/retour/inter */}
          {briefing && briefing.travels.length > 0 && (
            <PrintSection title="Trajets">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {briefing.travels.map((t, i) => {
                  const directionStyle: Record<
                    TravelDirection,
                    { bg: string; text: string; label: string; emoji: string }
                  > = {
                    OUTBOUND: {
                      bg: "bg-blue-50 border-blue-300",
                      text: "text-blue-800",
                      label: "Aller",
                      emoji: "→",
                    },
                    RETURN: {
                      bg: "bg-amber-50 border-amber-300",
                      text: "text-amber-800",
                      label: "Retour",
                      emoji: "↩",
                    },
                    INTER: {
                      bg: "bg-slate-100 border-slate-300",
                      text: "text-slate-700",
                      label: "Inter",
                      emoji: "↔",
                    },
                  };
                  const s = directionStyle[t.direction];
                  return (
                    <div
                      key={i}
                      className="rounded-md border border-slate-300 overflow-hidden break-inside-avoid"
                    >
                      <div
                        className={`flex items-center justify-between px-3 py-1.5 border-b border-slate-300 ${s.bg}`}
                      >
                        <div
                          className={`text-xs uppercase tracking-wider font-bold inline-flex items-center gap-1.5 ${s.text}`}
                        >
                          <span aria-hidden>{s.emoji}</span>
                          {s.label}
                        </div>
                        <div className="text-xs text-slate-600 tabular-nums">
                          {format(t.date, "EEEE d MMMM", { locale: fr })}
                        </div>
                      </div>

                      <div className="px-3 py-3 grid grid-cols-[1fr_40px_1fr] gap-2 items-center">
                        <div className="flex flex-col items-center text-center min-w-0">
                          <div className="font-bold text-sm text-slate-900 uppercase leading-tight break-words">
                            {t.fromStation || "—"}
                          </div>
                          <div className="text-xs text-slate-600 tabular-nums mt-1 inline-flex items-center gap-1">
                            <span aria-hidden>🕐</span>
                            {formatShowTime(t.fromTime) || "--:--"}
                          </div>
                        </div>
                        <div className={`text-2xl font-bold text-center ${s.text}`}>
                          →
                        </div>
                        <div className="flex flex-col items-center text-center min-w-0">
                          <div className="font-bold text-sm text-slate-900 uppercase leading-tight break-words">
                            {t.toStation || "—"}
                          </div>
                          <div className="text-xs text-slate-600 tabular-nums mt-1 inline-flex items-center gap-1">
                            <span aria-hidden>🕐</span>
                            {formatShowTime(t.toTime) || "--:--"}
                          </div>
                        </div>
                      </div>

                      {t.runs.length > 0 && (
                        <div className="border-t border-slate-300 bg-slate-50">
                          {t.runs.map((r, idx) => (
                            <div
                              key={idx}
                              className="px-3 py-1.5 text-xs flex items-center gap-3 border-b last:border-b-0 border-slate-200"
                            >
                              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 border border-slate-300 rounded px-1.5 py-0.5">
                                Run {t.runs.length > 1 ? idx + 1 : ""}
                              </span>
                              <span className="font-semibold uppercase text-slate-700">
                                {r.location || "—"}
                              </span>
                              <span className="text-slate-600 tabular-nums">
                                <span className="text-slate-500">Heure :</span>{" "}
                                {formatShowTime(r.time)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {t.comment && (
                        <div className="px-3 py-1.5 border-t border-slate-300 text-xs text-slate-600 italic bg-slate-50">
                          {t.comment}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </PrintSection>
          )}

          {/* HÉBERGEMENT & repas */}
          {briefing &&
            (briefing.hotelName ||
              briefing.hotelAddress ||
              briefing.restaurantName ||
              briefing.restaurantAddress ||
              briefing.restaurantCovered ||
              briefing.perDiemFlag) && (
              <PrintSection title="Hébergement & repas">
                <DefList>
                  {(briefing.hotelName || briefing.hotelAddress) && (
                    <DefItem
                      emoji="🛏️"
                      label="Hôtel"
                      value={
                        <span>
                          {briefing.hotelName && (
                            <span className="font-medium">
                              {briefing.hotelName}
                            </span>
                          )}
                          {briefing.hotelName && briefing.hotelAddress && " — "}
                          {briefing.hotelAddress && (
                            <AddressWithGmaps
                              address={briefing.hotelAddress}
                            />
                          )}
                        </span>
                      }
                    />
                  )}
                  {(briefing.restaurantName ||
                    briefing.restaurantAddress ||
                    briefing.restaurantCovered) && (
                    <DefItem
                      emoji="🍽️"
                      label="Restaurant"
                      value={
                        <span>
                          {briefing.restaurantName && (
                            <span className="font-medium">
                              {briefing.restaurantName}
                            </span>
                          )}
                          {/* Badge vert "· pris en charge" retiré
                              (Stan 2026-05-26) — était en doublon avec la
                              mention italique en dessous. */}
                          {briefing.restaurantName &&
                            briefing.restaurantAddress &&
                            " — "}
                          {briefing.restaurantAddress && (
                            <AddressWithGmaps
                              address={briefing.restaurantAddress}
                            />
                          )}
                          {!briefing.restaurantName &&
                            !briefing.restaurantAddress &&
                            briefing.restaurantCovered && (
                              <span className="italic text-slate-600">
                                Pris en charge (adresse à confirmer)
                              </span>
                            )}
                        </span>
                      }
                    />
                  )}
                  {briefing.perDiemFlag && (
                    <DefItem
                      emoji="💶"
                      label="Per diem"
                      value={
                        briefing.perDiemAmount != null
                          ? `${briefing.perDiemAmount} € / jour`
                          : "Oui"
                      }
                    />
                  )}
                </DefList>
              </PrintSection>
            )}

          {/* CONTACTS — table */}
          {briefing && briefing.contacts.length > 0 && (
            <PrintSection title="Contacts">
              {/* Stan 2026-05-26 : colonne Email retirée. Table à 4 cols
                  Rôle / Nom / Société / Téléphone.
                  Tri : membres Pangee Prod en tête (company === "Pangee Prod"),
                  puis le reste dans l'ordre d'ajout. */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="text-left px-2 py-1.5 border border-slate-300 w-32">
                      Rôle
                    </th>
                    <th className="text-left px-2 py-1.5 border border-slate-300">
                      Nom
                    </th>
                    <th className="text-left px-2 py-1.5 border border-slate-300">
                      Société
                    </th>
                    <th className="text-left px-2 py-1.5 border border-slate-300">
                      Téléphone
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...briefing.contacts]
                    .sort((a, b) => {
                      const aPangee = a.company === "Pangee Prod" ? 0 : 1;
                      const bPangee = b.company === "Pangee Prod" ? 0 : 1;
                      return aPangee - bPangee;
                    })
                    .map((c, i) => {
                    const fullName = [c.firstName, c.lastName]
                      .filter(Boolean)
                      .join(" ")
                      .trim();
                    return (
                      <tr key={i}>
                        <td className="px-2 py-1.5 border border-slate-300 font-semibold">
                          {ROLE_LABELS[c.role]}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-300">
                          {fullName || "—"}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-300">
                          {c.company ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-300 tabular-nums">
                          {c.phone ? (
                            <a
                              href={`tel:${phoneHref(c.phone)}`}
                              className="inline-flex items-center gap-1.5 text-slate-900 hover:text-slate-700 group/link"
                            >
                              <span>{formatPhone(c.phone)}</span>
                              <Phone className="h-3 w-3 text-slate-400 group-hover/link:text-slate-600 shrink-0" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </PrintSection>
          )}

          {/* NOTES */}
          {briefing?.notes && (
            <PrintSection title="Notes">
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {briefing.notes}
              </div>
            </PrintSection>
          )}

          {/* Cas vide */}
          {!briefing && (
            <div className="rounded-md border-2 border-dashed border-slate-300 p-8 text-center text-slate-500">
              Cette feuille de route n&apos;a pas encore été créée.
              <br />
              Retourne sur la fiche deal pour la créer.
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        /* Marges 0 — notre padding interne (px-10 py-6) garde la respiration.
           Repousse les en-têtes/pieds navigateur (URL, date, n° page) hors
           zone imprimable. */
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-document,
          .print-document * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .print-document {
            margin: 0 !important;
            max-width: 100% !important;
          }
          .print-section {
            break-inside: avoid;
          }
        }
        .print-document {
          max-width: 210mm;
          min-height: 297mm;
          color: #1a2540;
          font-family: var(--font-sans), system-ui, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>
    </>
  );
}

// ──────────────────────────── Sous-composants ────────────────────────────

function PrintSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="print-section">
      <h2 className="text-[#1a2540] text-base font-bold uppercase tracking-wider border-b-2 border-[#d4a93a] pb-1 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Lien Google Maps depuis une adresse texte libre. */
function gmapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function AddressWithGmaps({ address }: { address: string }) {
  return (
    <a
      href={gmapsLink(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-slate-900 hover:text-slate-700 transition-colors group/link"
      title="Ouvrir dans Google Maps"
    >
      <span>{address}</span>
      <MapPin className="h-3 w-3 text-slate-400 group-hover/link:text-slate-600 shrink-0" />
    </a>
  );
}

/**
 * Concatène les morceaux d'une adresse en évitant les doublons de ville :
 * si `city` est déjà contenu (insensible à la casse) dans `addressLine`, on
 * n'ajoute pas la ville une deuxième fois.
 */
function smartJoinAddress(
  addressLine: string | null | undefined,
  city: string | null | undefined,
): string {
  const a = (addressLine ?? "").trim();
  const c = (city ?? "").trim();
  if (!a && !c) return "";
  if (!a) return c;
  if (!c) return a;
  const norm = (s: string) =>
    s.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ");
  if (norm(a).includes(norm(c))) return a;
  return `${a}, ${c}`;
}

function DefList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-1 gap-y-1.5 list-none p-0 m-0">{children}</ul>
  );
}

function DefItem({
  emoji,
  label,
  value,
}: {
  emoji?: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[24px_140px_1fr] gap-2 text-sm items-baseline">
      <span aria-hidden className="text-base leading-none pt-0.5">
        {emoji ?? ""}
      </span>
      <span className="text-slate-500 uppercase text-[11px] tracking-wider font-semibold pt-0.5">
        {label}
      </span>
      <span className="text-slate-900">{value}</span>
    </li>
  );
}
