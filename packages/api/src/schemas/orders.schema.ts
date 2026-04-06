import { z } from "zod";

const orderItemSchema = z.object({
  productId: z.string().uuid("ID produit invalide"),
  quantity: z.number().int().min(1, "La quantité doit être au moins 1"),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Au moins un article requis"),
  deliveryDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Date de livraison invalide"),
  timeSlot: z.string().max(20).optional(),
  specialNotes: z.string().max(1000).optional(),
});

export const listOrdersQuerySchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "IN_DELIVERY", "DELIVERED", "CANCELLED"]).optional(),
  from: z.string().refine((val) => !isNaN(Date.parse(val)), "Date invalide").optional(),
  to: z.string().refine((val) => !isNaN(Date.parse(val)), "Date invalide").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "IN_DELIVERY", "DELIVERED", "CANCELLED"]),
});

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
