import type { DevisData } from "./devis-pdf";

const LS_KEY = "ls_devis_history";
const MAX = 60;

export interface DevisHistoryEntry {
  numero: string;
  date: string;
  label: string; // établissement ou nom du client
  totalCents: number;
  savedAt: number;
  data: DevisData;
}

export function loadHistory(): DevisHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as DevisHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: DevisHistoryEntry): DevisHistoryEntry[] {
  const all = loadHistory().filter((e) => e.numero !== entry.numero);
  const next = [entry, ...all].slice(0, MAX);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* quota dépassé : on ignore silencieusement */
  }
  return next;
}

export function removeFromHistory(numero: string): DevisHistoryEntry[] {
  const next = loadHistory().filter((e) => e.numero !== numero);
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  return next;
}
