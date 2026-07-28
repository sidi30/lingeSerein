/**
 * Helpers d'API pour les scénarios rotations / tournées / stock.
 *
 * Séparés de `api.ts` pour ne pas toucher aux helpers déjà utilisés par les
 * specs existantes. Ils s'appuient sur le même `apiRequest`.
 */

import { apiRequest } from "./api";

/** Date locale au format `AAAA-MM-JJ`. Jamais `toISOString()` : il décale d'un jour. */
export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface Envelope<T> {
  data?: T;
}

/* ─── Clients ─── */

export async function createClient(
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const ts = Date.now();
  const name = (overrides.name as string) ?? `QA Hotel ${ts}`;
  const { status, json } = await apiRequest("POST", "/clients", {
    name,
    address: "12 rue de la Paix, 84100 Orange",
    accommodationType: "HOTEL",
    source: "ADMIN",
    ...overrides,
  });
  if (status !== 201) throw new Error(`createClient failed: ${status} ${JSON.stringify(json)}`);

  const created = (json as Envelope<{ id?: string }>).data;
  if (created?.id) return { id: created.id, name };

  // Repli : certaines routes déclarent un `response` schema qui vide `data`.
  const list = await apiRequest("GET", `/clients?search=${encodeURIComponent(name)}&limit=1`);
  const rows = (list.json as { data?: Array<{ id: string }> }).data;
  if (!rows?.length) throw new Error(`createClient: ${name} introuvable après création`);
  return { id: rows[0]!.id, name };
}

/* ─── Tournées ─── */

export interface RoundStopInput {
  clientId: string;
  stopOrder: number;
  setsToDeliver: number;
}

export async function createRound(input: {
  date: string;
  driverId: string;
  stops: RoundStopInput[];
}): Promise<{ id: string }> {
  const { status, json } = await apiRequest("POST", "/deliveries/rounds", input);
  if (status !== 201) throw new Error(`createRound failed: ${status} ${JSON.stringify(json)}`);
  const created = (json as Envelope<{ id?: string }>).data;
  if (created?.id) return { id: created.id };

  const list = await apiRequest(
    "GET",
    `/deliveries/rounds?from=${input.date}&to=${input.date}&limit=1`,
  );
  const rows = (list.json as { data?: Array<{ id: string }> }).data;
  if (!rows?.length) throw new Error("createRound: tournée introuvable après création");
  return { id: rows[0]!.id };
}

/* ─── Rotations ─── */

export interface RotationLigneView {
  id: string;
  productSlug: string | null;
  designation: string;
  qtyLivree: number;
  qtyReprise: number;
}

export interface RotationView {
  id: string;
  clientNom: string;
  status: string;
  dateLivraison: string;
  dateReprisePrevue: string;
  dateRepriseReelle: string | null;
  lignes: RotationLigneView[];
  joursDeRetard: number;
}

export async function createRotation(input: {
  clientNom: string;
  dateLivraison: string;
  dateReprisePrevue?: string;
  formule?: "PONCTUEL" | "ABONNEMENT";
  clientAdresse?: string;
  lignes: Array<{ designation: string; qtyLivree: number; productSlug?: string }>;
}): Promise<RotationView> {
  const { status, json } = await apiRequest("POST", "/rotations", {
    formule: "PONCTUEL",
    ...input,
  });
  if (status !== 201) throw new Error(`createRotation failed: ${status} ${JSON.stringify(json)}`);

  const created = (json as Envelope<RotationView>).data;
  if (!created?.id) throw new Error(`createRotation: pas d'id dans la réponse`);
  // Relecture : garantit qu'on a bien les ids de lignes, indispensables à la reprise.
  return getRotation(created.id);
}

export async function getRotation(id: string): Promise<RotationView> {
  const { status, json } = await apiRequest("GET", `/rotations/${id}`);
  if (status !== 200) throw new Error(`getRotation failed: ${status}`);
  const data = (json as Envelope<RotationView>).data;
  if (!data) throw new Error("getRotation: réponse vide");
  return data;
}

/* ─── Stock par article ─── */

export interface StockItemView {
  productSlug: string;
  name: string;
  totalOwned: number;
  inCirculation: number;
  dirtyPending: number;
  retired: number;
  disponible: number;
}

export async function listStock(): Promise<StockItemView[]> {
  const { status, json } = await apiRequest("GET", "/stock");
  if (status !== 200) throw new Error(`listStock failed: ${status}`);
  return (json as { data?: StockItemView[] }).data ?? [];
}

export async function getStockItem(productSlug: string): Promise<StockItemView> {
  const { status, json } = await apiRequest("GET", `/stock/item/${productSlug}`);
  if (status !== 200) throw new Error(`getStockItem(${productSlug}) failed: ${status}`);
  const data = (json as Envelope<StockItemView>).data;
  if (!data) throw new Error("getStockItem: réponse vide");
  return data;
}

export async function setStockOwned(productSlug: string, totalOwned: number): Promise<void> {
  const { status, json } = await apiRequest("PATCH", `/stock/item/${productSlug}`, { totalOwned });
  if (status !== 200) {
    throw new Error(`setStockOwned(${productSlug}) failed: ${status} ${JSON.stringify(json)}`);
  }
}
