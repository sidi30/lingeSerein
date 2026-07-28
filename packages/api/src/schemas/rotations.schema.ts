import { z } from "zod";

/** Statuts de rotation (miroir de l'enum Prisma RotationStatus). */
export const ROTATION_STATUSES = [
  "PLANIFIEE",
  "LIVREE",
  "REPRISE",
  "EN_RETARD",
  "ANNULEE",
] as const;

/** Formules (miroir de l'enum Prisma RotationFormule). */
export const ROTATION_FORMULES = ["PONCTUEL", "ABONNEMENT"] as const;

/** Date au format calendaire — une rotation se raisonne au jour, pas à l'instant. */
const dateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide");

// ---- Liste / calendrier ----

/**
 * `from`/`to` filtrent sur la date de reprise PRÉVUE : c'est la question que se
 * pose l'exploitant (« qu'est-ce que je dois aller rechercher cette semaine ? »),
 * pas la date de livraison.
 */
export const listRotationsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  status: z.enum(ROTATION_STATUSES).optional(),
  formule: z.enum(ROTATION_FORMULES).optional(),
  userId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  /**
   * Restreint aux rotations de l'appelant (carte « Mon linge » du mobile).
   * Imposé côté serveur à partir du JWT — jamais depuis `userId`, qui laisserait
   * n'importe quel client lire les rotations d'un autre.
   */
  mine: z.coerce.boolean().optional(),
  /** Ne remonter que les rotations en retard (vue « à relancer »). */
  enRetard: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---- Création depuis une facture ----

export const createRotationFromInvoiceSchema = z.object({
  /**
   * Date de sortie du linge. Par défaut « aujourd'hui » : la facture est émise
   * au moment où le linge part.
   */
  dateLivraison: dateString.optional(),
  /**
   * Formule. Par défaut PONCTUEL — la détention de 7 jours est la règle la plus
   * stricte : se tromper dans ce sens déclenche une relance en avance, jamais un
   * dépassement du seuil hebdomadaire para-hôtelier.
   */
  formule: z.enum(ROTATION_FORMULES).default("PONCTUEL"),
  /** N° de passage (abonnement). */
  passage: z.number().int().min(1).max(999).optional(),
  deliveryStopId: z.string().uuid().optional(),
  notes: z.string().max(5000).optional(),
});

// ---- Création manuelle ----

export const createRotationLineSchema = z.object({
  designation: z.string().min(1).max(300),
  qtyLivree: z.number().int().min(0),
  /** Forcé par l'appelant ; à défaut, déduit de la désignation. */
  productSlug: z.string().max(60).optional(),
});

export const createRotationSchema = z.object({
  clientNom: z.string().min(1).max(200),
  clientEmail: z.string().email().max(320).optional(),
  clientAdresse: z.string().max(1000).optional(),
  userId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  deliveryStopId: z.string().uuid().optional(),
  formule: z.enum(ROTATION_FORMULES).default("PONCTUEL"),
  dateLivraison: dateString,
  /** Échéance explicite — sinon calculée par computeDateReprise. */
  dateReprisePrevue: dateString.optional(),
  passage: z.number().int().min(1).max(999).optional(),
  notes: z.string().max(5000).optional(),
  lignes: z.array(createRotationLineSchema).min(1),
});

// ---- Transition de statut ----

export const updateRotationStatusSchema = z.object({
  status: z.enum(ROTATION_STATUSES),
});

// ---- Enregistrement de la reprise ----

export const rotationRepriseLineSchema = z.object({
  id: z.string().uuid(),
  qtyReprise: z.number().int().min(0),
});

/**
 * Reprise du linge. `qtyReprise` peut être inférieure à `qtyLivree` (linge perdu
 * ou abîmé) : l'écart est conservé tel quel et remonté dans la réponse, il ne
 * doit surtout pas être « corrigé » silencieusement.
 */
export const rotationRepriseSchema = z.object({
  lignes: z.array(rotationRepriseLineSchema).min(1),
  dateRepriseReelle: dateString.optional(),
});

// ---- Types inférés ----

export type ListRotationsQuery = z.infer<typeof listRotationsQuerySchema>;
export type CreateRotationFromInvoiceInput = z.infer<typeof createRotationFromInvoiceSchema>;
export type CreateRotationInput = z.infer<typeof createRotationSchema>;
export type UpdateRotationStatusInput = z.infer<typeof updateRotationStatusSchema>;
export type RotationRepriseInput = z.infer<typeof rotationRepriseSchema>;
