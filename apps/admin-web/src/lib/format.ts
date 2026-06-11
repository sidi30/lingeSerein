/** Formate des centimes en euros localisés (fr-FR) */
export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

/** Formate une date ISO en date courte fr-FR */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

/** Formate une date ISO en date + heure fr-FR */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Convertit des euros (float) en centimes (Int) */
export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

/** Convertit des centimes (Int) en euros (float) */
export function centsToEuros(cents: number): number {
  return cents / 100;
}
