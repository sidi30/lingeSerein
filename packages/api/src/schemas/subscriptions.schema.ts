import { z } from "zod";

const subscriptionProductSchema = z.object({
  productId: z.string().uuid("ID produit invalide"),
  quantity: z.number().int().min(1),
});

export const createSubscriptionSchema = z.object({
  plan: z.enum(["ESSENTIELLE", "CONFORT", "PRESTIGE"]),
  products: z.array(subscriptionProductSchema).min(1, "Au moins un produit requis"),
});

export const listSubscriptionsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "PAST_DUE"]).optional(),
  plan: z.enum(["ESSENTIELLE", "CONFORT", "PRESTIGE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;
