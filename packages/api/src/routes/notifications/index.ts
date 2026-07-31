import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParamSchema, paginationSchema } from "@lingengo/shared";
import {
  NotificationsService,
  NOTIFICATION_SECTIONS,
} from "../../services/notifications.service.js";
import { ValidationError } from "../../utils/errors.js";

const sectionParamSchema = z.object({
  section: z.enum(NOTIFICATION_SECTIONS),
});

/**
 * Miroir EXHAUSTIF de l'enum Prisma `NotificationType`.
 *
 * Il manquait QUOTE_CREATED / ORDER_CREATED / USER_CREATED : un utilisateur ne
 * pouvait donc pas régler — ni couper — les notifications qui alimentent les
 * badges de l'admin, la requête étant rejetée en 400. Toute valeur ajoutée à
 * l'enum doit être reportée ici, sans quoi elle devient impossible à paramétrer.
 */
const NOTIFICATION_TYPES = [
  "QUOTE_CREATED",
  "ORDER_CREATED",
  "USER_CREATED",
  "STOCK_LOW",
  "ROTATION_REMINDER",
  "ROTATION_TODAY",
  "ROTATION_OVERDUE",
  "ROTATION_PICKED_UP",
  "DELIVERY_REMINDER",
  "DELIVERY_CONFIRMED",
  "DELIVERY_CANCELLED",
  "DELIVERY_DELAYED",
  "PAYMENT_FAILED",
  "PAYMENT_SUCCESS",
  "SUBSCRIPTION_RENEWED",
  "SUBSCRIPTION_EXPIRING",
  "ACCOUNT_LOCKED",
  "GENERAL",
] as const;

const updateSettingsSchema = z.object({
  settings: z.array(
    z.object({
      type: z.enum(NOTIFICATION_TYPES),
      channel: z.enum(["PUSH", "EMAIL", "BOTH"]),
      enabled: z.boolean(),
    }),
  ),
});

/**
 * Jeton push d'un appareil. `platform` est normalisé en minuscules : le mobile
 * envoie tantôt « iOS » tantôt « ios » selon l'API consultée, et une casse
 * divergente créerait deux lignes pour le même appareil.
 */
const deviceTokenSchema = z.object({
  token: z.string().min(1).max(255),
  platform: z
    .string()
    .max(20)
    .transform((p) => p.toLowerCase())
    .pipe(z.enum(["ios", "android", "web"])),
});

/**
 * Désinscription d'un appareil. Seul le jeton est demandé : `platform` ne sert
 * qu'à l'enregistrement, et l'exiger ici ferait échouer une déconnexion pour une
 * raison qui n'en est pas une.
 */
const deviceTokenDeleteSchema = z.object({
  token: z.string().min(1).max(255),
});

export default async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const service = new NotificationsService(app.prisma);

  // ---- GET /notifications (authenticated, paginated) ----
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const result = await service.list(request.user.sub, parsed.data.page, parsed.data.limit);
    return reply.send({ success: true, ...result });
  });

  // ---- PATCH /notifications/:id/read (authenticated) ----
  app.patch<{ Params: { id: string } }>(
    "/:id/read",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
      }

      const notification = await service.markAsRead(paramsParsed.data.id, request.user.sub);
      return reply.send({ success: true, data: notification });
    },
  );

  // ---- PATCH /notifications/read-all (authenticated) ----
  app.patch("/read-all", { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await service.markAllAsRead(request.user.sub);
    return reply.send({ success: true, data: result });
  });

  // ---- GET /notifications/unread-counts (authenticated) ----
  // Alimente les badges du menu latéral de l'admin. Volontairement très léger :
  // il est appelé en polling toutes les ~20s par chaque onglet ouvert.
  app.get("/unread-counts", { preHandler: [app.authenticate] }, async (request, reply) => {
    const counts = await service.unreadCountsBySection(request.user.sub);
    return reply.send({ success: true, data: counts });
  });

  // ---- PATCH /notifications/sections/:section/read (authenticated) ----
  // Comportement « dossier de boîte mail » : ouvrir la section vide son badge.
  app.patch<{ Params: { section: string } }>(
    "/sections/:section/read",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = sectionParamSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await service.markSectionAsRead(request.user.sub, parsed.data.section);
      return reply.send({ success: true, data: result });
    },
  );

  // ---- GET /notifications/settings (authenticated) ----
  app.get("/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const settings = await service.getSettings(request.user.sub);
    return reply.send({ success: true, data: settings });
  });

  // ---- PUT /notifications/settings (authenticated) ----
  app.put("/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const settings = await service.updateSettings(request.user.sub, parsed.data.settings);
    return reply.send({ success: true, data: settings });
  });

  // ---- POST /notifications/device-token (authenticated) ----
  // Sans cette route, aucun push ne peut partir : le serveur n'a aucune adresse
  // où écrire. L'échec était silencieux côté mobile.
  app.post(
    "/device-token",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["Notifications"],
        summary: "Enregistrer le jeton push de l'appareil courant",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["token", "platform"],
          properties: {
            token: { type: "string" },
            // PAS d'`enum` ici : Ajv valide AVANT Zod, donc un « iOS » majuscule
            // partait en 400 sans jamais atteindre la normalisation de casse
            // juste en dessous — l'enregistrement du push échoue alors en
            // silence côté mobile. La liste autorisée est tenue par Zod, seul
            // endroit qui voit la valeur normalisée.
            platform: { type: "string", description: "ios | android | web (casse indifférente)" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = deviceTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // Upsert sur le JETON et non sur (user, jeton) : réinstaller l'application
      // sur un téléphone revendu réattribue le même jeton Expo à quelqu'un
      // d'autre. Réassigner `userId` transfère la propriété au dernier inscrit —
      // sans quoi l'ancien propriétaire recevrait les notifications du nouveau.
      const record = await app.prisma.deviceToken.upsert({
        where: { token: parsed.data.token },
        create: {
          userId: request.user.sub,
          token: parsed.data.token,
          platform: parsed.data.platform,
        },
        update: {
          userId: request.user.sub,
          platform: parsed.data.platform,
          lastSeenAt: new Date(),
        },
        select: { id: true, platform: true, lastSeenAt: true },
      });

      return reply.send({ success: true, data: record });
    },
  );

  // ---- DELETE /notifications/device-token (authenticated) ----
  //
  // Contrepartie OBLIGATOIRE de l'enregistrement, et pas un confort : sans elle,
  // se déconnecter laisse le jeton attaché au compte en base. Le téléphone d'un
  // livreur parti de l'entreprise continue alors de recevoir ses affectations de
  // tournée — nom du client, adresse, horaires — sur un appareil que plus
  // personne ne contrôle. `POST /auth/logout` révoque le refresh token, ce qui
  // ferme l'accès à l'API, mais le push ne passe pas par l'API : il part de nos
  // serveurs vers Expo, sans jamais consulter la session.
  //
  // Idempotent : supprimer un jeton déjà absent renvoie 200 avec `supprime: 0`.
  // Une déconnexion ne doit pas échouer parce que le nettoyage a déjà eu lieu
  // (double appel, purge des 90 jours passée par là, réinstallation).
  app.delete(
    "/device-token",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["Notifications"],
        summary: "Désinscrire le jeton push de l'appareil courant",
        description:
          "À appeler à la déconnexion, AVANT d'effacer la session locale. Ne supprime que les " +
          "jetons appartenant à l'utilisateur authentifié.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const parsed = deviceTokenDeleteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // Filtrage par `userId` en plus du jeton, et c'est le point de sécurité de
      // cette route : `token` étant unique GLOBALEMENT, un `deleteMany` sur le
      // seul jeton permettrait à n'importe quel compte authentifié d'éteindre le
      // push d'un appareil qui ne lui appartient pas, en devinant ou en rejouant
      // un jeton — une coupure de notifications silencieuse, donc indétectable.
      //
      // Effet de bord voulu : si le jeton a déjà été réattribué à quelqu'un
      // d'autre (téléphone revendu, réinstallation sous un autre compte), la
      // clause ne matche pas et le nouveau propriétaire conserve son push. Se
      // déconnecter ne doit jamais couper les notifications d'un tiers.
      const { count } = await app.prisma.deviceToken.deleteMany({
        where: { token: parsed.data.token, userId: request.user.sub },
      });

      return reply.send({ success: true, data: { supprime: count } });
    },
  );
}
