import "server-only";

import { Resend } from "resend";

/**
 * Wrapper minimal sur Resend — envoi mail transactionnel pour la FDR
 * (Sprint 3.7 Lot D).
 *
 * ⚠️ PRÉ-DÉPLOIEMENT (task #50) :
 *   AVANT le déploiement prod, Stan doit faire un test d'envoi réel :
 *     1. Créer compte Resend + récupérer API key (re_xxxxx)
 *     2. Vérifier le domaine `pangeeprod.com` côté Resend
 *        (DNS records SPF + DKIM)
 *     3. Setter RESEND_API_KEY + MAIL_FROM dans .env du VPS
 *     4. Tester un envoi vers une vraie adresse
 *     5. Vérifier : pas spam, PJ PDF lisible, header navy/or préservé
 *   Tant que ce test n'a pas passé, l'app tourne en MODE DEV (log console)
 *   et aucun mail n'est réellement envoyé.
 *
 * Configuration (`.env.local`) :
 *   - `RESEND_API_KEY` : clé API Resend (re_xxxxx) — obligatoire en prod
 *   - `MAIL_FROM` : adresse expéditeur — ex. "Pangee Prod <fdr@pangeeprod.com>"
 *     Le domaine doit être vérifié dans le dashboard Resend
 *
 * Mode dev sans clé API : si `RESEND_API_KEY` est absent, on logge le mail
 * dans la console au lieu de l'envoyer (le `Sent` retourne ok=true pour
 * permettre de tester l'UI sans setup).
 */

export interface MailAttachment {
  filename: string;
  /** Contenu binaire — base64 ou Buffer. */
  content: Buffer | string;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  /** Corps HTML (avec line breaks via <br /> ou <p>). */
  html: string;
  /** Optionnel : version texte brute (fallback clients sans HTML). */
  text?: string;
  attachments?: MailAttachment[];
}

export interface SendMailResult {
  ok: true;
  id: string;
}

export interface SendMailError {
  ok: false;
  error: string;
}

/**
 * Envoie un mail transactionnel via Resend. Retourne `{ok:true, id}` si
 * accepté par Resend, `{ok:false, error}` sinon.
 *
 * En mode dev sans clé, simule l'envoi (log console) pour permettre de
 * tester l'UI Send Dialog sans setup Resend complet.
 */
export async function sendMail(
  input: SendMailInput,
): Promise<SendMailResult | SendMailError> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.MAIL_FROM ?? "Pangee Prod <onboarding@resend.dev>";

  if (!apiKey) {
    // Mode dev — log au lieu d'envoyer. Permet à Stan de tester l'UI
    // sans avoir configuré Resend (utile pour le développement local).
    console.warn(
      "[mailer] RESEND_API_KEY manquant — mail simulé (log only).\n" +
        `  To: ${Array.isArray(input.to) ? input.to.join(", ") : input.to}\n` +
        `  Subject: ${input.subject}\n` +
        `  Attachments: ${input.attachments?.length ?? 0}\n` +
        "  Body preview: " +
        input.html.replace(/<[^>]+>/g, "").slice(0, 200) +
        "…",
    );
    return { ok: true, id: "dev-simulated-" + Date.now() };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        // Resend accepte Buffer ou base64 — on convertit explicitement
        // si on a un Buffer Node pour éviter une ambiguïté.
        content:
          a.content instanceof Buffer
            ? a.content.toString("base64")
            : a.content,
      })),
    });

    if (error) {
      return { ok: false, error: error.message ?? "Erreur Resend inconnue" };
    }
    return { ok: true, id: data?.id ?? "unknown" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return { ok: false, error: message };
  }
}
