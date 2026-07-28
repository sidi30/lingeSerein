import type { InvoiceDTO } from "./types";

/**
 * Point d'intégration du PDF de facture.
 *
 * Import dynamique : `@react-pdf/renderer` est lourd et ne doit pas entrer dans
 * le bundle SSR — le module n'est chargé qu'au premier besoin. Son absence est
 * rattrapée : le bouton « Télécharger PDF » reste masqué au lieu de casser la
 * fiche facture.
 *
 * `InvoiceDTO` est un sur-ensemble structurel de l'`InvoiceForPdf` attendu par
 * le module : il est accepté tel quel, sans cast.
 */
export interface InvoicePdfModule {
  downloadInvoicePdf: (invoice: InvoiceDTO) => Promise<void>;
}

export async function loadInvoicePdf(): Promise<InvoicePdfModule | null> {
  try {
    return await import("@lingengo/ui/invoice-pdf");
  } catch (err) {
    console.error("Module PDF de facture indisponible", err);
    return null;
  }
}
