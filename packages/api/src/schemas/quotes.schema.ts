import { z } from "zod";

// ---- Ligne de devis ----

export const quoteLineInputSchema = z.object({
  designation: z.string().min(1, "La désignation est obligatoire").max(300),
  qty: z.number().int().min(1, "La quantité doit être supérieure à 0"),
  unitCents: z.number().int().min(0, "Le prix unitaire ne peut pas être négatif"),
  position: z.number().int().min(0),
});

// ---- Création ----

export const createQuoteSchema = z.object({
  clientNom: z.string().min(1, "Le nom du client est obligatoire").max(200),
  clientEmail: z.string().email("Format d'email invalide").max(320).nullable().optional(),
  clientTel: z.string().max(20).nullable().optional(),
  clientAdresse: z.string().nullable().optional(),
  userId: z.string().uuid("ID utilisateur invalide").nullable().optional(),
  lignes: z.array(quoteLineInputSchema).min(1, "Le devis doit contenir au moins une ligne"),
  remisePct: z.number().int().min(0).max(10000).default(0),
  livraisonCents: z.number().int().min(0).default(0),
  tvaApplicable: z.boolean().default(false),
  notes: z.string().max(5000).nullable().optional(),
  validiteJours: z.number().int().min(1).max(365).default(30),
});

// ---- Modification ----

export const updateQuoteSchema = z.object({
  clientNom: z.string().min(1, "Le nom du client est obligatoire").max(200).optional(),
  clientEmail: z.string().email("Format d'email invalide").max(320).nullable().optional(),
  clientTel: z.string().max(20).nullable().optional(),
  clientAdresse: z.string().nullable().optional(),
  userId: z.string().uuid("ID utilisateur invalide").nullable().optional(),
  lignes: z.array(quoteLineInputSchema).min(1).optional(),
  remisePct: z.number().int().min(0).max(10000).optional(),
  livraisonCents: z.number().int().min(0).optional(),
  tvaApplicable: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  validiteJours: z.number().int().min(1).max(365).optional(),
});

// ---- Transition de statut ----

export const updateQuoteStatusSchema = z.object({
  status: z.enum(["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"]),
});

// ---- Liste / filtres ----

export const listQuotesQuerySchema = z.object({
  status: z.enum(["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"]).optional(),
  search: z.string().max(200).optional(),
  from: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), "Date invalide")
    .optional(),
  to: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), "Date invalide")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---- Conversion en commande ----

export const convertQuoteSchema = z.object({
  deliveryDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Date de livraison invalide"),
  timeSlot: z.string().max(20).optional(),
  lineMappings: z
    .array(
      z.object({
        quoteLineId: z.string().uuid("ID ligne invalide"),
        productId: z.string().uuid("ID produit invalide"),
      }),
    )
    .min(1, "Le mapping des lignes est obligatoire"),
});

// ---- Types inférés ----

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type UpdateQuoteStatusInput = z.infer<typeof updateQuoteStatusSchema>;
export type ListQuotesQuery = z.infer<typeof listQuotesQuerySchema>;
export type ConvertQuoteInput = z.infer<typeof convertQuoteSchema>;
