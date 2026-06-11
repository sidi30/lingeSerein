/**
 * Schémas Zod — Subscriptions V2
 * ADR-V2-003 : plan optionnel (nullable) — Pack Sérénité = plan null.
 * ADR-V2-002 / ADR-V2-008 : SubscriptionConfig (lecture + mise à jour admin).
 * ADR-V2-006 : blocage résiliation si committedUntil non atteint.
 */

import { z } from "zod";

// ---- Souscription (POST /subscriptions) ----------------------------------------
// plan retiré du body obligatoire (ADR-V2-003) : la config dérive tout du SubscriptionConfig.
// products optionnel V2 — le service dérive la composition depuis la config.

const subscriptionProductSchema = z.object({
  productId: z.string().uuid("ID produit invalide"),
  quantity: z.number().int().min(1),
});

export const createSubscriptionSchema = z.object({
  // products optionnel : si absent, le service dérive kitBain+kitLit depuis SubscriptionConfig
  products: z.array(subscriptionProductSchema).optional(),
});

// ---- Mise à jour de la config abonnement (PATCH /subscriptions/config/admin) ----

export const updateSubscriptionConfigSchema = z
  .object({
    planName: z.string().min(1).max(100).optional(),
    priceCents: z.number().int().min(0, "Le prix ne peut pas être négatif").optional(),
    kitBainQty: z
      .number()
      .int()
      .min(0, "La quantité de kits bain doit être supérieure ou égale à 0")
      .optional(),
    kitLitQty: z
      .number()
      .int()
      .min(0, "La quantité de kits lit doit être supérieure ou égale à 0")
      .optional(),
    minEngagementMonths: z
      .number()
      .int()
      .min(0, "La durée d'engagement minimale doit être supérieure ou égale à 0")
      .optional(),
    noticePeriodDays: z
      .number()
      .int()
      .min(0, "Le préavis doit être supérieur ou égal à 0")
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Au moins un champ doit être fourni pour la mise à jour",
  });

// ---- Liste des abonnements (GET /subscriptions — admin) -----------------------

export const listSubscriptionsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "PAST_DUE"]).optional(),
  // plan conservé pour compat admin (ADR-V2-003) — filtre les legacy
  plan: z.enum(["ESSENTIELLE", "CONFORT", "PRESTIGE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---- Types inférés ----------------------------------------------------------

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionConfigInput = z.infer<typeof updateSubscriptionConfigSchema>;
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;
