import type { DevisData } from "@lingengo/shared";

const LS_KEY = "ls_devis_history";
const MAX = 60;

/**
 * Version du format stocké.
 *
 * v1 — `remisePct` était exprimé en POURCENT (10 = 10 %), format du PDF local
 *      historique de la vitrine.
 * v2 — `remisePct` est en CENTIÈMES DE POURCENT (1000 = 10 %), conformément au
 *      type {@link DevisData} de @lingengo/shared, désormais partagé avec l'admin.
 *
 * Sans migration, un devis enregistré avant la bascule serait relu avec une
 * remise cent fois trop faible : 10 % deviendrait 0,1 %.
 */
const SCHEMA_VERSION = 2;

export interface DevisHistoryEntry {
  numero: string;
  date: string;
  label: string; // établissement ou nom du client
  totalCents: number;
  savedAt: number;
  data: DevisData;
}

interface HistoryStore {
  version: number;
  entries: DevisHistoryEntry[];
}

function migrateV1toV2(entry: DevisHistoryEntry): DevisHistoryEntry {
  return {
    ...entry,
    data: { ...entry.data, remisePct: (entry.data.remisePct ?? 0) * 100 },
  };
}

function write(entries: DevisHistoryEntry[]): void {
  try {
    const store: HistoryStore = { version: SCHEMA_VERSION, entries };
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota dépassé : on ignore silencieusement */
  }
}

export function loadHistory(): DevisHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);

    // v1 : le store était un tableau nu, sans numéro de version.
    if (Array.isArray(parsed)) {
      const migrated = (parsed as DevisHistoryEntry[]).map(migrateV1toV2);
      write(migrated); // réécrit immédiatement : on ne migre qu'une fois
      return migrated;
    }

    const store = parsed as Partial<HistoryStore>;
    if (!Array.isArray(store.entries)) return [];
    // Un store écrit par une version PLUS RÉCENTE est laissé tel quel : on ne
    // sait pas le convertir, mieux vaut l'afficher que le corrompre.
    return store.entries;
  } catch {
    return [];
  }
}

export function saveToHistory(entry: DevisHistoryEntry): DevisHistoryEntry[] {
  const all = loadHistory().filter((e) => e.numero !== entry.numero);
  const next = [entry, ...all].slice(0, MAX);
  write(next);
  return next;
}

export function removeFromHistory(numero: string): DevisHistoryEntry[] {
  const next = loadHistory().filter((e) => e.numero !== numero);
  write(next);
  return next;
}
