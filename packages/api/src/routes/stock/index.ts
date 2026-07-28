import type { FastifyInstance } from "fastify";
import { StockService } from "../../services/stock.service.js";
import { StockItemsService } from "../../services/stock-items.service.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  stockAdjustmentSchema,
  listClientStocksQuerySchema,
  productSlugParamSchema,
  updateStockItemSchema,
} from "../../schemas/stock.schema.js";

export default async function stockRoutes(app: FastifyInstance): Promise<void> {
  const service = new StockService(app.prisma);
  const itemsService = new StockItemsService(app.prisma);
  const adminMiddleware = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  async function getOperatorId(userId: string): Promise<string> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });
    // `NotFoundError` et non `Error` : une Error nue sort en 500 « erreur
    // interne », alors que le compte a simplement disparu depuis l'émission
    // du jeton. Le client ne peut rien faire d'un 500, il sait quoi faire
    // d'un 404.
    if (!user) throw new NotFoundError("Utilisateur", userId);
    return user.operatorId;
  }

  // ---- GET /stock/me (client - own stock levels) ----
  app.get(
    "/me",
    { preHandler: [app.authenticate, requireRole("ROLE_CLIENT")] },
    async (request, reply) => {
      const result = await service.getClientStock(request.user.sub);
      return reply.send({ success: true, data: result });
    },
  );

  // ---- GET /stock/clients (admin - all client stocks) ----
  app.get(
    "/clients",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = listClientStocksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await service.listClientStocks(parsed.data);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /stock/operator (admin - global operator stock) ----
  app.get(
    "/operator",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);
      const stocks = await service.getOperatorStock(operatorId);
      return reply.send({ success: true, data: stocks });
    },
  );

  // ---- POST /stock/adjustment (admin - manual stock adjustment) ----
  app.post(
    "/adjustment",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const parsed = stockAdjustmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const movement = await service.createAdjustment(
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: movement });
    },
  );

  // ==========================================================================
  // Stock PAR SLUG catalogue (kit-bain, kit-complet…)
  // ==========================================================================
  // AJOUT, pas remplacement : les routes ci-dessus interrogent les tables
  // historiques clés par ProductRange (CONFORT/HOTEL/PRESTIGE), que le mobile
  // consomme toujours. Celles-ci exposent le parc réel de l'opérateur par slug,
  // seule granularité qui corresponde au catalogue vendu aujourd'hui.

  // ---- GET /stock (parc par slug, disponible calculé) ----
  app.get(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Stock"],
        summary: "Parc de linge par produit du catalogue",
        description:
          "Renvoie les 9 produits du catalogue, y compris ceux jamais inventoriés (à zéro). " +
          "`disponible` = totalOwned − inCirculation − dirtyPending − retired, calculé à la lecture.",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);
      const data = await itemsService.list(operatorId);
      return reply.send({ success: true, data });
    },
  );

  // ---- GET /stock/item/:productSlug ----
  // Sous /item/ pour ne pas capter "me", "clients" ou "operator" comme des slugs.
  app.get<{ Params: { productSlug: string } }>(
    "/item/:productSlug",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Stock"],
        summary: "Stock d'un produit du catalogue",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = productSlugParamSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const data = await itemsService.getBySlug(operatorId, parsed.data.productSlug);
      return reply.send({ success: true, data });
    },
  );

  // ---- PATCH /stock/item/:productSlug (saisie du parc possédé) ----
  app.patch<{ Params: { productSlug: string } }>(
    "/item/:productSlug",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Stock"],
        summary: "Saisir le parc possédé d'un produit (inventaire)",
        description:
          "Ne modifie que `totalOwned`. inCirculation / dirtyPending / retired sont le reflet " +
          "des rotations et ne se corrigent pas depuis cet écran.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["totalOwned"],
          properties: { totalOwned: { type: "integer", minimum: 0 } },
        },
      },
    },
    async (request, reply) => {
      const paramsParsed = productSlugParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = updateStockItemSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const data = await itemsService.setTotalOwned(
        operatorId,
        paramsParsed.data.productSlug,
        parsed.data.totalOwned,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data });
    },
  );
}
