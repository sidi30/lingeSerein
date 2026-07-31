import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema, refreshTokenSchema } from "@lingengo/shared";
import { AuthService } from "../../services/auth.service.js";
import { AppError, ValidationError } from "../../utils/errors.js";
import { changePasswordSchema } from "../../schemas/users.schema.js";
import { registerCommuneSchema, updateMyProfileSchema } from "../../schemas/auth.schema.js";
import { alignementCommune } from "../../utils/commune.js";
import { createAuditLog } from "../../utils/audit.js";
import { requireTrustedOrigin } from "../../middleware/csrf.js";
import { trustedOrigins } from "../../utils/origins.js";

/**
 * Projection UNIQUE du profil de l'utilisateur courant, partagée par `GET /me` et
 * `PATCH /me`.
 *
 * Deux routes, une seule forme : le mobile rafraîchit son cache avec la réponse
 * du PATCH sans avoir à relancer un GET. Deux `select` divergents auraient
 * silencieusement amputé l'objet mis en cache des champs manquants.
 *
 * Les champs modifiables (téléphone, adresse, ville, code postal, commune) sont
 * ici : un profil qu'on peut corriger mais pas relire n'a aucun intérêt.
 */
const PROFIL_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  address: true,
  city: true,
  postalCode: true,
  // La commune (code INSEE) porte le palier de livraison : l'application doit
  // pouvoir la relire pour afficher au client la zone — et le prix — qui
  // s'appliquent à lui, sans les recalculer de son côté.
  communeInsee: true,
  accommodationType: true,
  isEmailVerified: true,
  stockAlertThreshold: true,
  preferredTimeSlot: true,
  createdAt: true,
} as const;

/**
 * Routes d'authentification — /api/v1/auth/*
 */
export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService = new AuthService(app.prisma, app.redis, app);

  // ---- POST /register ----
  // Rate-limit dédié : 5 tentatives par minute par IP pour éviter l'abus d'inscription.
  app.post(
    "/register",
    { config: { rateLimit: { max: 5, timeWindow: "1m" } } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // La commune est validée à part : `registerSchema` vit dans
      // `@lingengo/shared` et ne la porte pas. Hors périmètre ⇒ 400, jamais un
      // compte créé en silence pour une adresse qu'on ne livrera pas.
      const commune = registerCommuneSchema.safeParse(request.body);
      if (!commune.success) {
        throw new ValidationError(commune.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // Ville et code postal ne sont pas demandés à l'inscription (l'adresse est
      // un texte libre) : ils se déduisent de la commune, ou restent vides.
      const adresse = alignementCommune(commune.data);

      // En v1, on utilise un opérateur par défaut (le premier).
      // En multi-opérateur, l'opérateur sera déterminé par la zone ou le domaine.
      const defaultOperator = await app.prisma.operator.findFirst({
        where: { isActive: true },
      });

      if (!defaultOperator) {
        throw new AppError(500, "NO_OPERATOR", "Aucun opérateur configuré");
      }

      await authService.register({
        ...parsed.data,
        ...(commune.data.communeInsee ? { communeInsee: commune.data.communeInsee } : {}),
        ...(adresse ?? {}),
        operatorId: defaultOperator.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      // TODO: envoyer l'email de vérification via BullMQ + Resend
      // Le résultat est ignoré intentionnellement (anti-énumération) :
      // on ne révèle pas si l'email existait déjà ou si un compte a été créé.

      // Réponse générique anti-énumération : même 201 que l'email existe ou non.
      return reply.status(201).send({
        success: true,
        data: {
          message:
            "Si cet email n'est pas déjà utilisé, un email de vérification vous a été envoyé.",
        },
      });
    },
  );

  // ---- POST /login ----
  // Rate-limit dédié : 10 tentatives par minute par IP pour limiter le brute-force
  // sans être trop restrictif pour les utilisateurs légitimes. La clé combine IP
  // (keyGenerator global hérite de la conf globale) et le préfixe de route.
  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1m" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      const result = await authService.login({
        ...parsed.data,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      // Refresh token en HttpOnly cookie (web) + dans le body (mobile)
      reply.setCookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "strict",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60, // 7 jours
      });

      return reply.send({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          userId: result.userId,
          role: result.role,
        },
      });
    },
  );

  // ---- POST /refresh ----
  // Seule route de l'API où un cookie suffit à prouver l'identité : c'est donc
  // la seule exposée au CSRF. Sans la garde, une page tierce ouverte dans le
  // navigateur de la victime peut déclencher une rotation de son jeton — elle ne
  // lit pas la réponse (CORS l'en empêche), mais elle invalide la session.
  // `/logout` lit aussi le cookie, sans être concerné : il exige en plus un
  // `Authorization` valide, que l'attaquant n'a pas.
  app.post(
    "/refresh",
    { preHandler: [requireTrustedOrigin(trustedOrigins())] },
    async (request, reply) => {
      // Accepter le refresh token depuis le cookie OU le body
      const cookieToken = (request.cookies as Record<string, string | undefined>)["refreshToken"];
      const bodyParsed = refreshTokenSchema.safeParse(request.body);
      const token = cookieToken ?? (bodyParsed.success ? bodyParsed.data.refreshToken : undefined);

      if (!token) {
        throw new ValidationError({ refreshToken: ["Refresh token requis"] });
      }

      const tokens = await authService.refresh(token);

      reply.setCookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "strict",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    },
  );

  // ---- POST /logout ----
  app.post("/logout", { preHandler: [app.authenticate] }, async (request, reply) => {
    const cookieToken = (request.cookies as Record<string, string | undefined>)["refreshToken"];
    const bodyParsed = refreshTokenSchema.safeParse(request.body);
    const token = cookieToken ?? (bodyParsed.success ? bodyParsed.data.refreshToken : undefined);

    if (token) {
      await authService.logout(token, request.user.sub, request.ip, request.headers["user-agent"]);
    }

    reply.clearCookie("refreshToken", { path: "/api/v1/auth" });

    return reply.send({
      success: true,
      data: { message: "Déconnexion réussie" },
    });
  });

  // ---- GET /verify-email/:token ----
  app.get<{ Params: { token: string } }>("/verify-email/:token", async (request, reply) => {
    await authService.verifyEmail(request.params.token, request.ip, request.headers["user-agent"]);

    return reply.send({
      success: true,
      data: { message: "Email vérifié avec succès. Vous pouvez maintenant vous connecter." },
    });
  });

  // ---- GET /me ----
  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.sub, deletedAt: null },
      select: PROFIL_SELECT,
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Utilisateur introuvable" },
      });
    }

    return reply.send({ success: true, data: user });
  });

  // ---- PATCH /me ----
  //
  // Le client corrige lui-même ses coordonnées (téléphone, adresse, créneau).
  // Jusqu'ici il devait appeler l'exploitation pour un déménagement ou un
  // changement de numéro, et la tournée partait sur une adresse périmée.
  //
  // Trois garde-fous, dans cet ordre :
  //   1. l'identité vient EXCLUSIVEMENT de `request.user.sub` (le JWT). Ni le
  //      corps ni l'URL ne portent d'identifiant : il n'y a donc rien à falsifier
  //      pour viser le compte d'un autre ;
  //   2. `updateMyProfileSchema` est en liste blanche `.strict()` — toute
  //      tentative d'écrire `role`, `operatorId`, `isActive`… est REJETÉE en 400,
  //      pas ignorée en silence ;
  //   3. l'écriture est filtrée sur `deletedAt: null` : un compte supprimé ne se
  //      remet pas à jour tout seul.
  //
  // Rate-limit dédié : rien ne justifie plus de 20 mises à jour de profil par
  // minute, et cela borne le coût d'un script qui pilonnerait la route.
  app.patch(
    "/me",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 20, timeWindow: "1m" } },
      schema: {
        tags: ["Authentification"],
        summary: "Modifier ses propres informations",
        description:
          "Champs autorisés : name, phone, address, city, postalCode, communeInsee, " +
          "preferredTimeSlot. Tout autre champ (role, email, isActive…) est rejeté en 400. " +
          "`communeInsee` doit désigner une commune du Vaucluse (liste fermée) : elle fixe " +
          "le palier de livraison, et aligne `city` et `postalCode` sur la commune choisie. " +
          "Renvoie le profil complet, dans la même forme que GET /auth/me.",
        security: [{ bearerAuth: [] }],
        // ⚠️ PAS de `additionalProperties: false` ici, et c'est délibéré :
        // Fastify configure Ajv avec `removeAdditional: true`, qui SUPPRIME les
        // champs surnuméraires au lieu de les refuser. Une tentative
        // d'élévation `{"role":"ROLE_ADMIN"}` serait donc effacée avant même
        // d'atteindre Zod, et renverrait un 200 rassurant — exactement le
        // « rejet silencieux » que ce schéma doit empêcher. Le corps arrive
        // intact, et `updateMyProfileSchema.strict()` le refuse en 400.
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 200 },
            phone: { type: ["string", "null"], maxLength: 20 },
            address: { type: ["string", "null"], maxLength: 500 },
            city: { type: ["string", "null"], maxLength: 120 },
            postalCode: { type: ["string", "null"], pattern: "^[0-9]{5}$" },
            // Pas de `null` : la commune se corrige, elle ne s'efface pas —
            // l'effacer remettrait le tarif sur la déduction par code postal
            // (cf. `updateMyProfileSchema`). Le périmètre (Vaucluse) est
            // vérifié par Zod contre la liste fermée, pas par ce motif.
            communeInsee: { type: "string", pattern: "^[0-9]{5}$" },
            preferredTimeSlot: {
              type: ["string", "null"],
              pattern: "^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = updateMyProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        // Un champ interdit ou un corps vide produit une erreur AU NIVEAU DU
        // CORPS, sans champ associé : `fieldErrors` seul aurait renvoyé un 400
        // aux détails vides, impossible à diagnostiquer côté mobile.
        const flat = parsed.error.flatten();
        const champsRefuses = parsed.error.issues.flatMap((issue) =>
          issue.code === "unrecognized_keys" ? issue.keys : [],
        );

        if (champsRefuses.length > 0) {
          // Trace volontaire : une tentative d'écriture sur `role` ou
          // `operatorId` est un signal de sécurité, pas un simple 400 de saisie.
          // Sans cette ligne, elle ne laisserait aucune trace.
          request.log.warn(
            { userId: request.user.sub, champs: champsRefuses },
            "PATCH /auth/me — champs non modifiables refusés",
          );
        }

        throw new ValidationError({
          ...(flat.fieldErrors as Record<string, string[]>),
          ...(champsRefuses.length > 0
            ? {
                body: [
                  `Champ(s) non modifiable(s) depuis votre profil : ${champsRefuses.join(", ")}`,
                ],
              }
            : flat.formErrors.length > 0
              ? { body: flat.formErrors }
              : {}),
        });
      }

      // ---- Le code postal ne peut pas voyager seul sur une fiche SANS commune ----
      //
      // `zoneTarifaire` (orders.service) préfère `communeInsee` et ne retombe sur
      // `postalCode` que si la commune est absente. Or `postalCode` est, lui,
      // librement écrit par le client depuis cette route. Sur une fiche sans
      // commune — inscription depuis un binaire mobile antérieur, ou client créé
      // par l'admin sans commune — il suffisait donc d'écrire « 84100 » pour
      // s'attribuer le palier ORANGE, soit 0 € de livraison au lieu de 25 €.
      // Le schéma interdit déjà d'EFFACER une commune pour la même raison ; il
      // restait le cas où elle n'a jamais été posée.
      //
      // On exige alors la commune dans le même corps : c'est elle qui fixe le
      // palier, et `alignementCommune` recalcule `city` et `postalCode` juste
      // après. L'écran mobile propose déjà le sélecteur de commune, et lie le
      // code postal à la commune retenue.
      if (parsed.data.postalCode !== undefined && parsed.data.communeInsee === undefined) {
        const fiche = await app.prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { communeInsee: true },
        });

        if (!fiche?.communeInsee) {
          request.log.warn(
            { userId: request.user.sub },
            "PATCH /auth/me — code postal seul refusé sur une fiche sans commune",
          );
          throw new ValidationError({
            communeInsee: [
              "Choisissez votre commune de livraison : c'est elle qui fixe le tarif, " +
                "le code postal seul ne suffit pas.",
            ],
          });
        }
      }

      // Commune choisie ⇒ `city` et `postalCode` en découlent : la commune, seul
      // des trois champs à être choisi dans une liste fermée, fait autorité sur
      // les deux autres (cf. `alignementCommune`).
      const alignement = alignementCommune(parsed.data);
      const donnees = alignement ? { ...parsed.data, ...alignement } : parsed.data;

      // `updateMany` et non `update` : `deletedAt` n'est pas une clé unique, il
      // ne peut donc pas entrer dans le `where` d'un `update`. Le compte à 0
      // distingue « compte introuvable ou supprimé » d'une modification réelle.
      const { count } = await app.prisma.user.updateMany({
        where: { id: request.user.sub, deletedAt: null },
        data: donnees,
      });

      if (count === 0) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Utilisateur introuvable" },
        });
      }

      // Seuls les NOMS des champs touchés sont journalisés. Leurs valeurs sont
      // des données personnelles (adresse, téléphone) : le journal d'audit est
      // conservé longtemps et lu par l'exploitation, il n'a pas à en porter.
      await createAuditLog({
        prisma: app.prisma,
        userId: request.user.sub,
        action: "UPDATE",
        entity: "User",
        entityId: request.user.sub,
        // `donnees` et non `parsed.data` : `city` et `postalCode` réalignés sur
        // la commune sont des écritures réelles, l'audit doit les nommer.
        changes: { fields: Object.keys(donnees), self: true },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      const user = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: PROFIL_SELECT,
      });

      return reply.send({ success: true, data: user });
    },
  );

  // ---- PATCH /me/password ----
  // Accessible à tout utilisateur authentifié (quel que soit son rôle).
  // Rate-limit dédié : 5 tentatives par minute pour limiter le brute-force.
  app.patch(
    "/me/password",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 5, timeWindow: "1m" } },
      schema: {
        tags: ["Authentification"],
        summary: "Changer son mot de passe",
        description:
          "Vérifie le mot de passe actuel, applique la même politique que l'inscription, " +
          "révoque tous les refresh tokens. L'access token en cours (15 min) reste valide.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", minLength: 1 },
            newPassword: { type: "string", minLength: 8, maxLength: 72 },
          },
        },
        response: {
          200: {
            description: "Mot de passe modifié avec succès",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: { message: { type: "string" } },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      await authService.changePassword(
        request.user.sub,
        parsed.data.currentPassword,
        parsed.data.newPassword,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.send({
        success: true,
        data: { message: "Mot de passe modifié" },
      });
    },
  );
}
