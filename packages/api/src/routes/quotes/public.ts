import type { FastifyInstance } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ROLES } from "@lingengo/shared";
import { QuotesService } from "../../services/quotes.service.js";
import { AppError, UnauthorizedError, ValidationError } from "../../utils/errors.js";

/**
 * Comparaison à temps constant du secret interne.
 *
 * On compare les empreintes SHA-256 (longueur fixe de 32 octets) plutôt que les
 * chaînes brutes : `timingSafeEqual` exige des buffers de même longueur et une
 * comparaison directe divulguerait la longueur du secret attendu. Le hachage
 * neutralise ce canal auxiliaire tout en gardant la comparaison résistante aux
 * attaques temporelles.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---- Contrat d'entrée (appel serveur-à-serveur depuis le mailer) ----
const publicQuoteLineSchema = z.object({
  designation: z.string().min(1).max(300),
  qty: z.number().int().min(1),
  unitCents: z.number().int().min(0),
  position: z.number().int().min(0),
});

const publicQuoteSchema = z.object({
  clientNom: z.string().min(1).max(200),
  clientEmail: z.string().email().max(320).optional(),
  clientTel: z.string().max(20).optional(),
  clientAdresse: z.string().max(500).optional(),
  lignes: z.array(publicQuoteLineSchema).min(1),
  livraisonCents: z.number().int().min(0).default(0),
  remisePct: z.number().int().min(0).default(0),
  tvaApplicable: z.boolean().default(false),
  notes: z.string().max(5000).optional(),
  validiteJours: z.number().int().min(1).max(365).default(30),
});

/**
 * Route interne PUBLIQUE (non authentifiée par JWT) de création de devis.
 *
 * Enregistrée sous /api/v1/quotes → chemin final POST /api/v1/quotes/public.
 *
 * Elle n'est PAS destinée au navigateur : elle est appelée en serveur-à-serveur
 * par le mailer (apps/mailer) qui reçoit le formulaire de devis de la vitrine.
 * La seule protection est le secret partagé `INTERNAL_INTAKE_SECRET` (header
 * `x-internal-secret`), ce qui la rend inutilisable depuis un navigateur (le
 * secret n'est jamais exposé côté client) tout en évitant d'ouvrir le CORS.
 *
 * Fail-closed : si le secret n'est pas configuré, on répond 503 (jamais 200).
 */
export default async function publicQuoteRoutes(app: FastifyInstance): Promise<void> {
  const service = new QuotesService(app.prisma);

  app.post(
    "/public",
    // Rate-limit dédié anti-abus : 20 créations / 15 min par IP source.
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      // 1) Garde serveur-à-serveur — fail-closed si le secret n'est pas configuré.
      const expected = process.env["INTERNAL_INTAKE_SECRET"];
      if (!expected) {
        throw new AppError(
          503,
          "INTAKE_DISABLED",
          "L'intake interne des devis n'est pas configuré",
        );
      }
      const provided = request.headers["x-internal-secret"];
      if (typeof provided !== "string" || !secretMatches(provided, expected)) {
        throw new UnauthorizedError("Secret interne invalide");
      }

      // 2) Validation du corps.
      const parsed = publicQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      }

      // 3) Résolution de l'opérateur par défaut (v1 mono-opérateur).
      const operator = await app.prisma.operator.findFirst({ where: { isActive: true } });
      if (!operator) {
        throw new AppError(500, "NO_OPERATOR", "Aucun opérateur actif configuré");
      }

      // 4) createdBy est obligatoire et doit référencer un User réel : on prend
      //    le plus ancien admin actif de l'opérateur comme auteur du devis.
      const admin = await app.prisma.user.findFirst({
        where: {
          operatorId: operator.id,
          role: { in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] },
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!admin) {
        throw new AppError(
          500,
          "NO_ADMIN_USER",
          "Aucun administrateur disponible pour attribuer le devis",
        );
      }

      // 5) Création via le service (numéro LSQ-YYYY-NNNN, statut BROUILLON, audit).
      const quote = await service.create(
        parsed.data,
        operator.id,
        admin.id,
        request.ip,
        request.headers["user-agent"],
      );

      return reply.status(201).send({
        success: true,
        data: { id: quote.id, numero: quote.numero, totals: quote.totals },
      });
    },
  );
}
