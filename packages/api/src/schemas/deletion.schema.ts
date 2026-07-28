import { z } from "zod";

/**
 * Drapeau `?cascade=true` des routes de suppression.
 *
 * Absent ⇒ `false` : la cascade ne s'active JAMAIS par défaut. Un appel
 * `DELETE /users/:id` fait par une interface qui ignore ce paramètre garde donc
 * exactement le comportement qu'elle avait avant (soft-delete simple) — c'est ce
 * qui permet de livrer la cascade sans casser l'admin déjà déployé.
 *
 * `"1"` et `"true"` sont acceptés indifféremment : les clients HTTP sérialisent
 * les booléens de query dans les deux formes.
 */
export const cascadeQuerySchema = z.object({
  cascade: z
    .union([z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0")])
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type CascadeQuery = z.infer<typeof cascadeQuerySchema>;
