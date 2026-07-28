import type { FastifyInstance } from "fastify";
import { idParamSchema, ROLES } from "@lingengo/shared";
import { RotationsService } from "../../services/rotations.service.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createRotationSchema,
  createRotationFromInvoiceSchema,
  listRotationsQuerySchema,
  rotationRepriseSchema,
  updateRotationStatusSchema,
  ROTATION_FORMULES,
  ROTATION_STATUSES,
} from "../../schemas/rotations.schema.js";

export default async function rotationRoutes(app: FastifyInstance): Promise<void> {
  const service = new RotationsService(app.prisma);
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

  // ---- GET /rotations (liste + vue calendrier) ----
  app.get(
    "/",
    {
      // Authentification seule, PAS `adminMiddleware` : le mobile appelle cette
      // route avec `?mine=1` pour la carte « Mon linge » du client. La
      // restriction au périmètre de l'appelant est appliquée ci-dessous.
      preHandler: [app.authenticate],
      schema: {
        tags: ["Rotations"],
        summary: "Liste des rotations (filtres statut / période / client)",
        description:
          "`from` et `to` filtrent sur la date de reprise PRÉVUE — c'est la vue calendrier. " +
          "Un appelant non-administrateur ne voit QUE ses propres rotations, `mine` ou non.",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            from: { type: "string", description: "Début de plage (date de reprise prévue)" },
            to: { type: "string", description: "Fin de plage (date de reprise prévue)" },
            status: { type: "string", enum: [...ROTATION_STATUSES] },
            formule: { type: "string", enum: [...ROTATION_FORMULES] },
            userId: { type: "string" },
            mine: { type: "boolean", description: "Restreindre aux rotations de l'appelant" },
            search: { type: "string" },
            enRetard: { type: "boolean" },
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = listRotationsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const isAdmin =
        request.user.role === "ROLE_ADMIN" || request.user.role === "ROLE_SUPER_ADMIN";

      // Un non-administrateur est TOUJOURS borné à ses propres rotations, que
      // `mine` soit passé ou non : s'en remettre au paramètre laisserait n'importe
      // quel client lire tout le carnet en l'omettant. Un admin qui demande
      // `mine=1` obtient bien les siennes.
      const forcedUserId = !isAdmin || parsed.data.mine ? request.user.sub : undefined;

      const operatorId = await getOperatorId(request.user.sub);

      // Aucune écriture ici : c'est une lecture. Ce filet réservé à l'admin
      // rendait de surcroît la réponse DIFFÉRENTE selon le rôle de l'appelant,
      // pour la même donnée. La bascule EN_RETARD appartient au cron
      // `rotation-overdue` ; l'ancienneté du retard, elle, est déjà calculée à
      // la lecture (`joursDeRetard`) sans rien persister.
      const result = await service.list(parsed.data, operatorId, forcedUserId);
      return reply.send({ success: true, ...result });
    },
  );

  // ---- GET /rotations/summary (compteurs tableau de bord) ----
  // Déclarée AVANT /:id : sinon "summary" serait capté comme un identifiant.
  app.get(
    "/summary",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Rotations"],
        summary: "Compteurs d'exploitation (reprises du jour, de demain, retards)",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const operatorId = await getOperatorId(request.user.sub);
      // Lecture pure, cf. `GET /rotations` — le cron `rotation-overdue` bascule.
      const data = await service.summary(operatorId);
      return reply.send({ success: true, data });
    },
  );

  // ---- POST /rotations (création manuelle) ----
  app.post(
    "/",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Rotations"],
        summary: "Créer une rotation à la main",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = createRotationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const rotation = await service.create(
        parsed.data,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: rotation });
    },
  );

  // ---- POST /rotations/from-invoice/:id ----
  app.post<{ Params: { id: string } }>(
    "/from-invoice/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Rotations"],
        summary: "Créer la rotation du linge sorti pour une facture",
        description:
          "Reprend les lignes du snapshot figé de la facture et calcule l'échéance de reprise " +
          "selon la formule (7 j en ponctuel, 14 j en abonnement).",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            dateLivraison: { type: "string" },
            formule: { type: "string", enum: [...ROTATION_FORMULES] },
            passage: { type: "integer", minimum: 1, maximum: 999 },
            deliveryStopId: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = createRotationFromInvoiceSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const rotation = await service.createFromInvoice(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({ success: true, data: rotation });
    },
  );

  // ---- GET /rotations/:id ----
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      // Authentification seule, comme `GET /rotations?mine=1` : le périmètre
      // est forcé plus bas côté serveur, un non-admin ne voit que ses rotations.
      preHandler: [app.authenticate],
      schema: {
        tags: ["Rotations"],
        summary: "Détail d'une rotation",
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
      const isAdmin = request.user.role === ROLES.ADMIN || request.user.role === ROLES.SUPER_ADMIN;
      const rotation = await service.getById(
        paramsParsed.data.id,
        operatorId,
        isAdmin ? undefined : request.user.sub,
      );
      return reply.send({ success: true, data: rotation });
    },
  );

  // ---- PATCH /rotations/:id/status ----
  app.patch<{ Params: { id: string } }>(
    "/:id/status",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Rotations"],
        summary: "Changer le statut d'une rotation",
        description:
          "La clôture (REPRISE) passe obligatoirement par PATCH /rotations/:id/reprise, " +
          "qui exige les quantités revenues pour solder le stock.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["status"],
          properties: { status: { type: "string", enum: [...ROTATION_STATUSES] } },
        },
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = updateRotationStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const rotation = await service.updateStatus(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: rotation });
    },
  );

  // ---- PATCH /rotations/:id/reprise ----
  app.patch<{ Params: { id: string } }>(
    "/:id/reprise",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Rotations"],
        summary: "Enregistrer la reprise du linge (clôture + stock)",
        description:
          "Les lignes non transmises sont soldées à 0 : la rotation est clôturée entièrement, " +
          "l'écart entre livré et repris est porté en perte.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["lignes"],
          properties: {
            lignes: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "qtyReprise"],
                properties: {
                  id: { type: "string" },
                  qtyReprise: { type: "integer", minimum: 0 },
                },
              },
            },
            dateRepriseReelle: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const parsed = rotationRepriseSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const operatorId = await getOperatorId(request.user.sub);
      const rotation = await service.enregistrerReprise(
        paramsParsed.data.id,
        operatorId,
        parsed.data,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: rotation });
    },
  );

  // ---- DELETE /rotations/:id (soft-delete) ----
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: adminMiddleware,
      schema: {
        tags: ["Rotations"],
        summary: "Supprimer une rotation (soft-delete, reprise ou annulée uniquement)",
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
      const result = await service.softDelete(
        paramsParsed.data.id,
        operatorId,
        request.user.sub,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({ success: true, data: result });
    },
  );
}
