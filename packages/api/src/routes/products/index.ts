/**
 * Routes Products V2
 * ADR-V2-001 : slug + kind, category/range optionnels.
 * ADR-V2-008 : PATCH /:id/price (raccourci modification de prix).
 */

import type { FastifyInstance } from "fastify";
import { idParamSchema } from "@lingengo/shared";
import { ProductsService } from "../../services/products.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createProductSchema,
  updateProductSchema,
  priceUpdateSchema,
  listProductsQuerySchema,
} from "../../schemas/products.schema.js";

export default async function productRoutes(app: FastifyInstance): Promise<void> {
  const service = new ProductsService(app.prisma);

  // ---- GET /products (public — mobile + admin) --------------------------------
  app.get("/", async (request, reply) => {
    const parsed = listProductsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    // includeInactive est réservé aux admins. Route publique : on tente une vérification
    // optionnelle du token ; si non-admin (ou pas de token), le paramètre est ignoré.
    let includeInactive = false;
    if (parsed.data.includeInactive) {
      try {
        await request.jwtVerify();
        const role = request.user.role;
        includeInactive = role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN";
      } catch {
        includeInactive = false;
      }
    }

    const result = await service.list({ ...parsed.data, includeInactive });
    return reply.send({ success: true, ...result });
  });

  // ---- GET /products/:id (public) -------------------------------------------
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const paramsParsed = idParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      throw new ValidationError(
        paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const product = await service.getById(paramsParsed.data.id);
    return reply.send({ success: true, data: product });
  });

  // ---- POST /products (admin only) ------------------------------------------
  app.post(
    "/",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = createProductSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const admin = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { operatorId: true },
      });

      const product = await service.create(
        parsed.data,
        admin!.operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: product });
    },
  );

  // ---- PUT /products/:id (admin only) — édition complète --------------------
  app.put<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = updateProductSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const product = await service.update(
        paramsParsed.data.id,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: product });
    },
  );

  // ---- PATCH /products/:id/price (admin only) — raccourci prix (ADR-V2-008) --
  app.patch<{ Params: { id: string } }>(
    "/:id/price",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = priceUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const product = await service.updatePrice(
        paramsParsed.data.id,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: product });
    },
  );

  // ---- DELETE /products/:id (admin only, soft delete) -----------------------
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      await service.softDelete(
        paramsParsed.data.id,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: { message: "Produit supprimé" } });
    },
  );
}
