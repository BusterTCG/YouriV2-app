import "server-only";

/**
 * Client HTTP vers l'API externe de KuroNeko-App.
 *
 * KN = hub annuaire authoritatif sur Contact / Venue / VenueRoom (cf.
 * docs/architecture-decisions.md). Toutes les lectures / écritures sur ces
 * entités passent par ce client.
 *
 * Auth : Bearer token `INTER_APP_TOKEN` (identique côté KN et côté Youri,
 * dans le .env des deux apps).
 *
 * Timeout : 5s. KN tourne sur le même VPS — soit ça répond vite, soit ça
 * plante. Pas de retry automatique (on remonte l'erreur au user via UI).
 *
 * Stratégie de lecture (snapshot) : quand on choisit un contact dans le form
 * Deal, Youri stocke {contactId, contactName, contactCompany, contactCity}
 * sur le Deal. Refetch via API uniquement quand l'user clique "Modifier".
 * Cf. docs/process/code-conventions.md § Inter-app.
 */

// ─────────── Types (miroir des PUBLIC_FIELDS côté KN) ───────────

export type ContactType =
  | "ORGANIZER"
  | "AGENCY"
  | "ARTIST"
  | "PRODUCTION"
  | "TECHNICAL"
  | "PRESS"
  | "BRAND"
  | "OTHER";

export interface KnContact {
  id: string;
  firstName: string;
  lastName: string | null;
  company: string | null;
  city: string | null;
  profession: string | null;
  phone: string | null;
  email: string | null;
  type: ContactType;
  venueId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnVenueRoom {
  id: string;
  venueId?: string;
  name: string;
  capacity: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnVenue {
  id: string;
  name: string;
  city: string;
  address: string | null;
  capacity: number | null;
  notes: string | null;
  rooms: KnVenueRoom[];
  createdAt: string;
  updatedAt: string;
}

export interface KnList<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Snapshot minimal stocké côté Youri sur les Deals — moins de champs que
// KnContact / KnVenue (juste ce qu'on affiche sans refetch).
export interface ContactSnapshot {
  contactId: string;
  contactName: string;
  contactCompany: string | null;
  contactCity: string | null;
}

export interface VenueSnapshot {
  venueId: string;
  venueName: string;
  venueCity: string;
}

// ─────────── Erreurs ───────────

/**
 * Erreur métier "annuaire KN indisponible" — à différencier des erreurs
 * de validation (qui restent en 400 JSON normal).
 */
export class KnApiUnavailableError extends Error {
  constructor(message = "Annuaire indisponible, réessaie dans quelques secondes") {
    super(message);
    this.name = "KnApiUnavailableError";
  }
}

/** Erreur "ressource introuvable" (404). */
export class KnNotFoundError extends Error {
  constructor(message = "Élément introuvable côté annuaire") {
    super(message);
    this.name = "KnNotFoundError";
  }
}

/** Erreur de validation côté KN (400). Contient les fieldErrors. */
export class KnValidationError extends Error {
  fieldErrors: Record<string, string[]>;
  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "KnValidationError";
    this.fieldErrors = fieldErrors;
  }
}

// ─────────── Core fetch ───────────

const DEFAULT_TIMEOUT_MS = 5_000;

type QueryValue = string | number | undefined | null;

interface KnFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /**
   * Query string params. Les undefined/null/empty-string sont skippés.
   * Type permissif (any sur les values) pour accepter les interfaces typées
   * comme ListContactsParams sans avoir à ajouter une index signature partout.
   */
  query?: { [key: string]: QueryValue };
  timeoutMs?: number;
}

interface KnSuccessResponse<T> {
  ok: true;
  data: T;
}

interface KnErrorResponse {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[]>;
}

async function knFetch<T>(
  path: string,
  opts: KnFetchOptions = {},
): Promise<T> {
  const baseUrl = process.env.KN_API_BASE_URL;
  const token = process.env.INTER_APP_TOKEN;

  if (!baseUrl) throw new Error("KN_API_BASE_URL absent dans l'env Youri V2");
  if (!token) throw new Error("INTER_APP_TOKEN absent dans l'env Youri V2");

  // Construit l'URL avec query params optionnels
  const url = new URL(path, baseUrl);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      // Pas de cache Next côté server (snapshot strategy = fresh data quand
      // on call explicitement).
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === "AbortError") {
      throw new KnApiUnavailableError("Annuaire KN — timeout (5s)");
    }
    // ECONNREFUSED, DNS, etc. → KN down
    throw new KnApiUnavailableError(
      `Annuaire KN injoignable (${e instanceof Error ? e.message : "?"})`,
    );
  } finally {
    clearTimeout(timeout);
  }

  // 404 → ressource absente
  if (res.status === 404) {
    throw new KnNotFoundError();
  }

  // 503 (KN sans config / down logique) → indispo
  if (res.status === 503) {
    throw new KnApiUnavailableError();
  }

  // 401 → token invalide côté config (pas censé arriver vu la config commune)
  if (res.status === 401) {
    throw new Error(
      "INTER_APP_TOKEN refusé par KN — vérifie que le token est identique des 2 côtés",
    );
  }

  let body: KnSuccessResponse<T> | KnErrorResponse;
  try {
    body = (await res.json()) as KnSuccessResponse<T> | KnErrorResponse;
  } catch {
    throw new Error(`Réponse KN non-JSON (status ${res.status})`);
  }

  if (!body.ok) {
    // Erreur 400 / 409 / 500 avec body { ok: false, error, fieldErrors? }
    if (res.status === 400 && "fieldErrors" in body) {
      throw new KnValidationError(body.error, body.fieldErrors ?? {});
    }
    throw new Error(body.error || `Erreur KN (status ${res.status})`);
  }

  return body.data;
}

// ─────────── Contacts ───────────

export interface ListContactsParams {
  q?: string;
  limit?: number;
  offset?: number;
}

export function listContacts(params: ListContactsParams = {}): Promise<KnList<KnContact>> {
  return knFetch<KnList<KnContact>>("/api/external/contacts", {
    query: { ...params },
  });
}

export function getContact(id: string): Promise<KnContact> {
  return knFetch<KnContact>(`/api/external/contacts/${encodeURIComponent(id)}`);
}

export interface CreateContactInput {
  firstName: string;
  lastName?: string | null;
  company?: string | null;
  city?: string | null;
  profession?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  type?: ContactType;
  venueId?: string | null;
}

export function createContact(input: CreateContactInput): Promise<KnContact> {
  return knFetch<KnContact>("/api/external/contacts", { method: "POST", body: input });
}

export type UpdateContactInput = Partial<CreateContactInput>;

export function updateContact(id: string, input: UpdateContactInput): Promise<KnContact> {
  return knFetch<KnContact>(`/api/external/contacts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}

/**
 * Soft-delete d'un contact (côté KN). Le contact reste en BDD KN avec
 * `deletedAt` set, visible dans /trash KN où Stan peut restaurer/purger.
 */
export function deleteContact(id: string): Promise<void> {
  return knFetch<void>(`/api/external/contacts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ─────────── Venues ───────────

export interface ListVenuesParams {
  q?: string;
  limit?: number;
  offset?: number;
}

export function listVenues(params: ListVenuesParams = {}): Promise<KnList<KnVenue>> {
  return knFetch<KnList<KnVenue>>("/api/external/venues", {
    query: { ...params },
  });
}

export function getVenue(id: string): Promise<KnVenue> {
  return knFetch<KnVenue>(`/api/external/venues/${encodeURIComponent(id)}`);
}

export interface CreateVenueInput {
  name: string;
  city: string;
  address?: string | null;
  capacity?: number | null;
  notes?: string | null;
}

export function createVenue(input: CreateVenueInput): Promise<KnVenue> {
  return knFetch<KnVenue>("/api/external/venues", { method: "POST", body: input });
}

export type UpdateVenueInput = Partial<CreateVenueInput>;

export function updateVenue(id: string, input: UpdateVenueInput): Promise<KnVenue> {
  return knFetch<KnVenue>(`/api/external/venues/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}

// ─────────── Venue rooms (sous-salles) ───────────

export function listVenueRooms(
  venueId: string,
): Promise<{ items: KnVenueRoom[]; total: number }> {
  return knFetch<{ items: KnVenueRoom[]; total: number }>(
    `/api/external/venues/${encodeURIComponent(venueId)}/rooms`,
  );
}

export interface CreateVenueRoomInput {
  name: string;
  capacity?: number | null;
  notes?: string | null;
}

export function createVenueRoom(
  venueId: string,
  input: CreateVenueRoomInput,
): Promise<KnVenueRoom> {
  return knFetch<KnVenueRoom>(`/api/external/venues/${encodeURIComponent(venueId)}/rooms`, {
    method: "POST",
    body: input,
  });
}
