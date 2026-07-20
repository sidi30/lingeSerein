import type { FastifyInstance } from "fastify";
import { CATALOG_PRODUCTS, SUBSCRIPTION_DEFAULTS } from "@lingengo/shared";
import { idParamSchema } from "@lingengo/shared";
import { SettingsService } from "../../services/settings.service.js";
import { ValidationError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createZoneSchema,
  updateZoneSchema,
  updateOperatorSchema,
  updateStockThresholdsSchema,
} from "../../schemas/settings.schema.js";

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const service = new SettingsService(app.prisma);
  const adminMiddleware = [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")];

  async function getOperatorId(userId: string): Promise<string> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { operatorId: true },
    });
    if (!user) throw new Error("Utilisateur introuvable");
    return user.operatorId;
  }

  // ---- GET /settings/zones ----
  app.get(
    "/zones",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Liste des zones de livraison",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);
      const zones = await service.listZones(operatorId);
      return reply.send({ success: true, data: zones });
    },
  );

  // ---- POST /settings/zones ----
  app.post(
    "/zones",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Créer une zone de livraison",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "postalCodes", "deliveryFeeCents"],
          properties: {
            name: { type: "string" },
            postalCodes: { type: "array", items: { type: "string" } },
            deliveryFeeCents: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = createZoneSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const zone = await service.createZone(
        parsed.data,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: zone });
    },
  );

  // ---- PATCH /settings/zones/:id ----
  app.patch<{ Params: { id: string } }>(
    "/zones/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Modifier une zone de livraison",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = updateZoneSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const zone = await service.updateZone(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: zone });
    },
  );

  // ---- DELETE /settings/zones/:id ----
  app.delete<{ Params: { id: string } }>(
    "/zones/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Supprimer une zone de livraison",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.deleteZone(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );

  // ---- GET /settings/operator ----
  app.get(
    "/operator",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Infos de l'opérateur courant",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);
      const operator = await service.getOperator(operatorId);
      return reply.send({ success: true, data: operator });
    },
  );

  // ---- PATCH /settings/operator ----
  app.patch(
    "/operator",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Modifier les infos de l'opérateur",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
            phone: { type: "string", nullable: true },
            address: { type: "string", nullable: true },
            siret: { type: "string", nullable: true },
            legalMentions: { type: "string", nullable: true },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = updateOperatorSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const operator = await service.updateOperator(
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: operator });
    },
  );

  // ---- GET /settings/stock-thresholds ----
  app.get(
    "/stock-thresholds",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Seuils d'alerte stock par produit",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);
      const thresholds = await service.getStockThresholds(operatorId);
      return reply.send({ success: true, data: thresholds });
    },
  );

  // ---- PATCH /settings/stock-thresholds ----
  app.patch(
    "/stock-thresholds",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Réglages"],
        summary: "Mettre à jour les seuils d'alerte stock",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["thresholds"],
          properties: {
            thresholds: {
              type: "array",
              items: {
                type: "object",
                required: ["productId", "stockAlertThreshold"],
                properties: {
                  productId: { type: "string", format: "uuid" },
                  stockAlertThreshold: { type: "integer", minimum: 0 },
                },
              },
              minItems: 1,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = updateStockThresholdsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const result = await service.updateStockThresholds(
        parsed.data,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );

  // ---- GET /settings/price-drift (admin) --------------------------------------
  // La VITRINE est la source de vérité des prix : ses tarifs sont des constantes
  // TypeScript compilées au build (packages/shared), elle ne lit jamais la base.
  // La base peut donc silencieusement diverger de ce que voient les visiteurs —
  // un client verrait un prix sur le site et un autre sur son devis.
  // Cette route compare les deux et signale tout écart. Elle ne corrige rien :
  // c'est un détecteur, la correction reste une décision.
  app.get(
    "/price-drift",
    { preHandler: [app.authenticate, requireRole("ROLE_ADMIN", "ROLE_SUPER_ADMIN")] },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);

      const produits = await app.prisma.product.findMany({
        where: { operatorId, deletedAt: null },
        select: { slug: true, name: true, priceCents: true },
      });
      const parSlug = new Map(produits.map((p) => [p.slug, p]));

      const ecarts: {
        type: "produit" | "abonnement";
        cle: string;
        libelle: string;
        vitrineCents: number;
        adminCents: number | null;
      }[] = [];

      for (const attendu of CATALOG_PRODUCTS) {
        const enBase = parSlug.get(attendu.slug);
        if (!enBase || enBase.priceCents !== attendu.priceCents) {
          ecarts.push({
            type: "produit",
            cle: attendu.slug,
            libelle: attendu.name,
            vitrineCents: attendu.priceCents,
            adminCents: enBase?.priceCents ?? null,
          });
        }
      }

      const config = await app.prisma.subscriptionConfig.findUnique({ where: { operatorId } });
      if (!config || config.priceCents !== SUBSCRIPTION_DEFAULTS.PRICE_CENTS) {
        ecarts.push({
          type: "abonnement",
          cle: "pack-serenite",
          libelle: SUBSCRIPTION_DEFAULTS.PLAN_NAME,
          vitrineCents: SUBSCRIPTION_DEFAULTS.PRICE_CENTS,
          adminCents: config?.priceCents ?? null,
        });
      }

      return reply.send({
        success: true,
        data: {
          aligne: ecarts.length === 0,
          ecarts,
          // Rappel explicite du sens de la correction, pour que personne ne
          // "corrige" la vitrine sur la base par erreur.
          sourceDeVerite: "vitrine",
        },
      });
    },
  );
}
