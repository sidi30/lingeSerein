import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Stockage persistant des demandes de devis reçues via le formulaire public.
 *
 * Choix : fichier JSONL (une demande = une ligne JSON) plutôt qu'une base de
 * données. Le volume de leads d'une vitrine est faible (quelques par jour) et
 * cela évite toute dépendance native (better-sqlite3) incompatible avec le
 * build `npm install` sur node:alpine. Le fichier vit dans un volume Docker
 * (DATA_DIR) pour survivre aux redéploiements du conteneur.
 *
 * Une seule instance du mailer tourne en prod → les écritures synchrones
 * suffisent, pas de risque de course concurrente entre processus.
 */

export type QuoteStatus = "new" | "read" | "archived";

export interface QuoteRequest {
  id: string;
  createdAt: string; // ISO 8601
  name: string;
  company: string;
  email: string;
  phone: string;
  message: string;
  status: QuoteStatus;
  ip?: string;
}

const DATA_DIR = process.env.DATA_DIR || "/data";
const FILE = join(DATA_DIR, "quote-requests.jsonl");

function ensureStore(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) writeFileSync(FILE, "", "utf8");
}

/** Ajoute une demande (append O(1)) et renvoie l'entrée créée. */
export function addQuoteRequest(
  input: Omit<QuoteRequest, "id" | "createdAt" | "status">,
): QuoteRequest {
  ensureStore();
  const entry: QuoteRequest = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "new",
    ...input,
  };
  appendFileSync(FILE, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

/** Liste toutes les demandes, plus récente d'abord. Les lignes corrompues sont ignorées. */
export function listQuoteRequests(): QuoteRequest[] {
  ensureStore();
  const raw = readFileSync(FILE, "utf8");
  const out: QuoteRequest[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as QuoteRequest);
    } catch {
      /* ligne illisible : on la saute plutôt que de tout casser */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Réécrit le fichier de façon atomique (écriture temporaire + rename). */
function rewrite(all: QuoteRequest[]): void {
  ensureStore();
  const tmp = `${FILE}.tmp`;
  const body = all.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(tmp, all.length ? body + "\n" : "", "utf8");
  renameSync(tmp, FILE);
}

/** Change le statut d'une demande. Renvoie false si l'id est introuvable. */
export function setQuoteStatus(id: string, status: QuoteStatus): boolean {
  const all = listQuoteRequests();
  const target = all.find((e) => e.id === id);
  if (!target) return false;
  target.status = status;
  rewrite(all);
  return true;
}

/** Supprime définitivement une demande. Renvoie false si l'id est introuvable. */
export function deleteQuoteRequest(id: string): boolean {
  const all = listQuoteRequests();
  const next = all.filter((e) => e.id !== id);
  if (next.length === all.length) return false;
  rewrite(next);
  return true;
}
