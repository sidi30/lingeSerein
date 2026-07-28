import { z } from "zod";

/** Statuts de facture (miroir de l'enum Prisma InvoiceStatus). */
export const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "REFUNDED",
] as const;

// ---- Création depuis un devis ----

export const createInvoiceFromQuoteSchema = z.object({
  /** Délai de paiement en jours à compter de l'émission. */
  dueDays: z.number().int().min(0).max(365).default(30),
  /** Date d'échéance explicite — prioritaire sur `dueDays` si fournie. */
  dueDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), "Date d'échéance invalide")
    .optional(),
});

// ---- Transition de statut ----

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(INVOICE_STATUSES),
  /**
   * Date d'encaissement (statut PAID). Par défaut « maintenant » — permet de
   * saisir a posteriori un règlement reçu la semaine précédente.
   */
  paidAt: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), "Date de paiement invalide")
    .optional(),
});

// ---- Liste / filtres ----

/**
 * Statuts à exclure, en CSV : `?excludeStatus=DRAFT` ou `?excludeStatus=DRAFT,CANCELLED`.
 *
 * Répond au besoin « que les brouillons cessent de polluer la vue » : le filtre
 * `status` ne retient qu'UN statut, si bien que l'admin devait tout charger puis
 * filtrer côté client — ce qui vidait les pages de leur contenu (la pagination
 * compte les brouillons, l'affichage non) et faisait disparaître des factures
 * réelles. Exclure côté serveur rend la pagination exacte à nouveau.
 *
 * Un statut inconnu est ignoré silencieusement plutôt que rejeté : ce filtre est
 * un confort d'affichage, il ne doit jamais transformer une liste en erreur 400.
 */
const excludeStatusSchema = z
  .string()
  .optional()
  .transform((raw) =>
    raw
      ? raw
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s): s is (typeof INVOICE_STATUSES)[number] =>
            (INVOICE_STATUSES as readonly string[]).includes(s),
          )
      : [],
  );

export const listInvoicesQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  excludeStatus: excludeStatusSchema,
  /** Millésime de la facture (numérotation FACT-YYYY-NNNN). */
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---- Types inférés ----

export type CreateInvoiceFromQuoteInput = z.infer<typeof createInvoiceFromQuoteSchema>;
export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
