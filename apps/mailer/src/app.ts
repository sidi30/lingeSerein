import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  confirmationEmail,
  notificationEmail,
  devisNotificationEmail,
  devisClientConfirmationEmail,
  rotationReminderClientEmail,
  rotationReminderOwnerEmail,
  rotationOverdueEmail,
} from "./templates.js";
import { addQuoteRequest, deleteQuoteRequest, listQuoteRequests, setQuoteStatus } from "./store.js";
import { renderInbox, requireBasicAuth } from "./inbox.js";

// Origins autorisées (CORS). Supporte une liste séparée par des virgules.
// Inclut apex + www par défaut (le site répond sur les deux via Traefik).
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGIN || "https://lingeserein.fr,https://www.lingeserein.fr"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Interdit tout caractère de contrôle (U+0000..U+001F + U+007F), CR/LF inclus :
// empêche l'injection d'en-têtes email quand une valeur alimente le Subject.
const noControlChars = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);
// Variante pour le message : autorise \n et \r mais aucun autre contrôle.
const noControlCharsExceptNewline = (v: string) =>
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);

const contactSchema = z
  .object({
    name: z.string().min(2).max(100).refine(noControlChars, "Caractères invalides"),
    company: z.string().min(2).max(200).refine(noControlChars, "Caractères invalides"),
    email: z.string().email().max(254),
    // Téléphone : chiffres, espaces et ponctuation usuelle uniquement.
    phone: z
      .string()
      .min(8)
      .max(20)
      .regex(/^[+()\d\s.-]+$/, "Numéro de téléphone invalide"),
    message: z
      .string()
      .min(10)
      .max(2000)
      .refine(noControlCharsExceptNewline, "Caractères invalides"),
    // Honeypot anti-bot : champ invisible côté client, doit rester vide.
    website: z.string().max(0).optional(),
  })
  .strict();

// ─── Schéma du formulaire de devis structuré (vitrine → /api/devis) ───
// Reprend les mêmes gardes anti-injection d'en-têtes que contactSchema.
const devisLineSchema = z
  .object({
    designation: z.string().min(1).max(300).refine(noControlChars, "Caractères invalides"),
    qty: z.number().int().min(1),
    unitCents: z.number().int().min(0),
  })
  .strict();

const devisSchema = z
  .object({
    name: z.string().min(2).max(100).refine(noControlChars, "Caractères invalides"),
    company: z.string().min(2).max(200).refine(noControlChars, "Caractères invalides"),
    email: z.string().email().max(254),
    phone: z
      .string()
      .min(8)
      .max(20)
      .regex(/^[+()\d\s.-]+$/, "Numéro de téléphone invalide"),
    note: z
      .string()
      .max(2000)
      .refine(noControlCharsExceptNewline, "Caractères invalides")
      .optional(),
    zone: z.string().max(100).refine(noControlChars, "Caractères invalides").optional(),
    lignes: z.array(devisLineSchema).min(1),
    livraisonCents: z.number().int().min(0).default(0),
    recap: z.string().max(4000).refine(noControlCharsExceptNewline, "Caractères invalides"),
    // Honeypot anti-bot : doit rester vide.
    website: z.string().max(0).optional(),
  })
  .strict();

/**
 * Dépendances injectées à l'application.
 *
 * L'envoi d'email est fourni par l'appelant plutôt que construit ici : c'est ce
 * qui rend les routes testables sans SMTP (et garantit qu'un test ne fera jamais
 * partir un vrai email). En production, `server.ts` passe le transport Gmail.
 */
export interface MailMessage {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
}

export interface SendMailResult {
  messageId?: string;
}

export type SendMail = (message: MailMessage) => Promise<SendMailResult>;

export interface BuildAppDeps {
  sendMail: SendMail;
  /** Adresse expéditrice, également destinataire des emails « propriétaire ». */
  mailFrom: string;
}

// ─── Endpoint transactionnel interne (API → mailer) ───
//
// Variables d'environnement attendues :
//   INTERNAL_INTAKE_SECRET  (obligatoire) secret partagé avec packages/api.
//                           Absent ⇒ la route répond 503, jamais 200.
//   GMAIL_USER / GMAIL_APP_PASSWORD  déjà requis au démarrage (expéditeur SMTP).
//
// L'API n'a aucun client SMTP : elle délègue ici l'envoi de ses emails de
// rotation (ADR §6). Même motif de garde que l'intake de devis
// (packages/api/src/routes/quotes/public.ts), en sens inverse — secret partagé
// dans `x-internal-secret`, jamais de CORS ni de JWT.

/**
 * Comparaison à temps constant du secret interne.
 *
 * On compare les empreintes SHA-256 (32 octets, longueur fixe) plutôt que les
 * chaînes brutes : `timingSafeEqual` exige des buffers de même longueur, et une
 * comparaison directe divulguerait la longueur du secret attendu. Le hachage
 * ferme ce canal auxiliaire tout en restant résistant aux attaques temporelles.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const rotationLigneSchema = z
  .object({
    designation: z.string().min(1).max(300).refine(noControlChars, "Caractères invalides"),
    qty: z.number().int().min(0),
  })
  .strict();

// Date de calendrier stricte : le rendu français est fait par le template, qui
// décompose la chaîne à la main. Un Date/ISO complet réintroduirait un fuseau.
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

const creneauSchema = z.string().max(20).refine(noControlChars, "Caractères invalides");

// Discriminée sur `template` : chaque template a ses propres données, et un
// payload destiné à l'un ne peut pas passer pour l'autre.
const notifySchema = z.discriminatedUnion("template", [
  z
    .object({
      to: z.string().email().max(320),
      subject: z.string().min(1).max(200).refine(noControlChars, "Caractères invalides"),
      template: z.literal("rotation_reminder_client"),
      data: z
        .object({
          clientNom: z.string().min(1).max(200).refine(noControlChars, "Caractères invalides"),
          datePassage: isoDateSchema,
          creneau: creneauSchema.optional(),
          lignes: z.array(rotationLigneSchema).max(100).default([]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      to: z.string().email().max(320),
      subject: z.string().min(1).max(200).refine(noControlChars, "Caractères invalides"),
      template: z.literal("rotation_reminder_owner"),
      data: z
        .object({
          datePassage: isoDateSchema,
          passages: z
            .array(
              z
                .object({
                  clientNom: z
                    .string()
                    .min(1)
                    .max(200)
                    .refine(noControlChars, "Caractères invalides"),
                  clientAdresse: z
                    .string()
                    .max(500)
                    .refine(noControlChars, "Caractères invalides")
                    .optional(),
                  formule: z.enum(["PONCTUEL", "ABONNEMENT"]).optional(),
                  creneau: creneauSchema.optional(),
                  lignes: z.array(rotationLigneSchema).max(100).default([]),
                })
                .strict(),
            )
            .max(200)
            .default([]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      to: z.string().email().max(320),
      subject: z.string().min(1).max(200).refine(noControlChars, "Caractères invalides"),
      template: z.literal("rotation_overdue"),
      data: z
        .object({
          clientNom: z.string().min(1).max(200).refine(noControlChars, "Caractères invalides"),
          clientAdresse: z
            .string()
            .max(500)
            .refine(noControlChars, "Caractères invalides")
            .optional(),
          dateReprisePrevue: isoDateSchema,
          joursDeRetard: z.number().int().min(0).max(3650),
          lignes: z.array(rotationLigneSchema).max(100).default([]),
          facturableRemplacement: z.boolean().optional(),
          montantRemplacementCents: z.number().int().min(0).optional(),
        })
        .strict(),
    })
    .strict(),
]);

type NotifyBody = z.infer<typeof notifySchema>;

function renderNotify(body: NotifyBody): string {
  switch (body.template) {
    case "rotation_reminder_client":
      return rotationReminderClientEmail(body.data);
    case "rotation_reminder_owner":
      return rotationReminderOwnerEmail(body.data);
    case "rotation_overdue":
      return rotationOverdueEmail(body.data);
  }
}

/**
 * Construit l'application Fastify — routes comprises — sans l'écouter.
 *
 * Séparé de `server.ts` pour que les tests puissent instancier l'app et la
 * piloter via `app.inject()` : le point d'entrée, lui, appelle `listen()` et
 * `process.exit()`, ce qui le rend inimportable depuis un test.
 */
export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  // bodyLimit borné (16 KiB) pour réduire la surface DoS sur un endpoint public.
  const app = Fastify({
    logger: {
      // Ne jamais journaliser de secret ni de PII brute dans les logs.
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.email",
          "req.body.phone",
          "GMAIL_APP_PASSWORD",
        ],
        remove: true,
      },
    },
    bodyLimit: 16 * 1024,
    // Derrière Traefik : sans trustProxy, request.ip vaut l'IP du conteneur proxy,
    // donc @fastify/rate-limit partagerait la limite stricte de /api/contact entre
    // TOUS les visiteurs (un 429 global au bout de 5 envois) et on stockerait une IP
    // inutile. trustProxy fait résoudre request.ip depuis X-Forwarded-For (posé par Traefik).
    trustProxy: true,
  });

  await app.register(cors, {
    origin: [...ALLOWED_ORIGINS, "http://localhost:3002"],
    methods: ["POST"],
  });

  // Limite globale généreuse (permet à l'admin de parcourir l'inbox sans être
  // bloqué). La limite stricte anti-abus est appliquée par route sur /api/contact.
  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
  });

  // Le formulaire admin POST en application/x-www-form-urlencoded. On n'a pas
  // besoin du corps (l'action et l'id sont dans l'URL) : on parse en objet vide
  // pour éviter un 415 Unsupported Media Type sur ces requêtes.
  app.addContentTypeParser("application/x-www-form-urlencoded", (_req, _payload, done) =>
    done(null, {}),
  );

  // Health check — réponse minimale, aucune info d'environnement divulguée.
  app.get("/health", async () => ({ status: "ok" }));

  // Contact form — limite stricte anti-abus (5 / 15 min) propre à cet endpoint public.
  app.post(
    "/api/contact",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const result = contactSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Données invalides",
          details: result.error.flatten().fieldErrors,
        });
      }

      const data = result.data;

      // Honeypot rempli => bot. On répond 200 (pas d'indice à l'attaquant) sans envoyer.
      if (data.website && data.website.length > 0) {
        return reply.status(200).send({ message: "Demande envoyée avec succès" });
      }

      // Défense en profondeur : neutralise tout CR/LF résiduel dans le sujet.
      const safeCompany = data.company.replace(/[\r\n]+/g, " ").trim();

      // Persiste la demande AVANT l'envoi email : ainsi aucun lead n'est perdu même
      // si le SMTP échoue. Une erreur de stockage ne doit jamais casser la réponse.
      try {
        addQuoteRequest({
          name: data.name,
          company: data.company,
          email: data.email,
          phone: data.phone,
          message: data.message,
          ip: request.ip,
        });
      } catch (err) {
        app.log.error({ err }, "Échec de la persistance de la demande de devis");
      }

      // Dégradation gracieuse : le lead est DÉJÀ persisté (visible dans /admin/devis).
      // Les deux envois sont donc indépendants et « best effort » — on log en cas
      // d'échec sans jamais throw. Ainsi une auth SMTP cassée (App Password) ou un
      // échec de la confirmation client ne provoque plus de 500 → pas de retry visiteur,
      // donc pas de leads/emails dupliqués, et le proprio récupère la demande via l'inbox.
      try {
        // Email de notification pour Linge Serein
        await deps.sendMail({
          from: `"Linge Serein" <${deps.mailFrom}>`,
          to: deps.mailFrom,
          replyTo: data.email,
          subject: `Nouvelle demande de devis — ${safeCompany}`,
          html: notificationEmail(data),
        });
      } catch (err) {
        app.log.error({ err }, "Échec de l'envoi de la notification propriétaire");
      }

      try {
        // Email de confirmation pour le client
        await deps.sendMail({
          from: `"Linge Serein" <${deps.mailFrom}>`,
          to: data.email,
          subject: "Linge Serein — Nous avons bien reçu votre demande",
          html: confirmationEmail(data),
        });
      } catch (err) {
        app.log.error({ err }, "Échec de l'envoi de la confirmation client");
      }

      return reply.status(200).send({ message: "Demande envoyée avec succès" });
    },
  );

  // ─── Devis structuré — orchestration création API + emails ───
  // La vitrine POST ici son formulaire de devis détaillé. Ce endpoint :
  //   (a) persiste un lead de secours (JSONL) — jamais de perte,
  //   (b) crée le vrai devis via l'API interne (best-effort),
  //   (c) notifie le propriétaire (détail complet du devis),
  //   (d) confirme au visiteur (SANS détail, simple accusé de réception).
  // Toujours 200 après validation : les étapes b/c/d sont « best effort ».
  app.post(
    "/api/devis",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const result = devisSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Données invalides",
          details: result.error.flatten().fieldErrors,
        });
      }

      const data = result.data;

      // Honeypot rempli => bot. 200 sans effet (aucun indice à l'attaquant).
      if (data.website && data.website.length > 0) {
        return reply.status(200).send({ message: "Demande envoyée avec succès" });
      }

      // Défense en profondeur : neutralise tout CR/LF résiduel dans le sujet.
      const safeCompany = data.company.replace(/[\r\n]+/g, " ").trim();

      // (a) Persiste un lead de secours AVANT tout appel réseau : aucun lead perdu
      // même si l'API interne et/ou le SMTP échouent.
      try {
        addQuoteRequest({
          name: data.name,
          company: data.company,
          email: data.email,
          phone: data.phone,
          message: data.recap,
          ip: request.ip,
        });
      } catch (err) {
        app.log.error({ err }, "Échec de la persistance de la demande de devis web");
      }

      // (b) Crée le vrai devis côté API interne (serveur-à-serveur). Best-effort :
      // un échec ne casse jamais la réponse — le lead est déjà persisté et les
      // emails partent quand même (le propriétaire saisira le devis à la main).
      let created: { id?: string; numero?: string; totalTTC?: number } = {};
      try {
        const apiBase = process.env.INTERNAL_API_URL ?? "http://ls-api:3001";
        const notes =
          `\u{1F310} Demande web${data.zone ? " — zone " + data.zone : ""}\n\n` +
          data.recap +
          (data.note ? "\n\nMessage du client:\n" + data.note : "");

        const res = await fetch(`${apiBase}/api/v1/quotes/public`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_INTAKE_SECRET ?? "",
          },
          body: JSON.stringify({
            clientNom: data.name,
            clientEmail: data.email,
            clientTel: data.phone,
            clientAdresse: data.zone || data.company,
            livraisonCents: data.livraisonCents,
            notes,
            lignes: data.lignes.map((l, i) => ({ ...l, position: i })),
          }),
        });

        if (res.ok) {
          const json = (await res.json()) as {
            data?: { id?: string; numero?: string; totals?: { totalTTC?: number } };
          };
          created = {
            id: json.data?.id,
            numero: json.data?.numero,
            totalTTC: json.data?.totals?.totalTTC,
          };
        } else {
          app.log.error({ status: res.status }, "L'API interne a rejeté la création du devis");
        }
      } catch (err) {
        app.log.error({ err }, "Échec de l'appel à l'API interne de création du devis");
      }

      // (c) Notification propriétaire — détail complet du devis. Best-effort.
      try {
        await deps.sendMail({
          from: `"Linge Serein" <${deps.mailFrom}>`,
          to: deps.mailFrom,
          replyTo: data.email,
          subject: `Nouveau devis web — ${safeCompany}`,
          html: devisNotificationEmail({
            name: data.name,
            company: data.company,
            email: data.email,
            phone: data.phone,
            zone: data.zone,
            note: data.note,
            lignes: data.lignes,
            livraisonCents: data.livraisonCents,
            numero: created.numero,
            quoteId: created.id,
            totalTTC: created.totalTTC,
          }),
        });
      } catch (err) {
        app.log.error({ err }, "Échec de l'envoi de la notification devis (propriétaire)");
      }

      // (d) Confirmation visiteur — SANS aucun détail du devis. Best-effort.
      try {
        await deps.sendMail({
          from: `"Linge Serein" <${deps.mailFrom}>`,
          to: data.email,
          subject: "Linge Serein — votre demande de devis",
          html: devisClientConfirmationEmail(data.name),
        });
      } catch (err) {
        app.log.error({ err }, "Échec de l'envoi de la confirmation devis (visiteur)");
      }

      return reply.status(200).send({ message: "Demande envoyée avec succès" });
    },
  );

  app.post(
    "/api/internal/notify",
    {
      // Plafond large et propre à la route : un rappel J-1 part en rafale, un
      // envoi par client. La limite globale (60/min) bloquerait la campagne du
      // soir dès la soixantième rotation. L'accès reste fermé par le secret.
      config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
      // Le bodyLimit global (16 KiB) borne la surface DoS des formulaires
      // PUBLICS. Il est trop bas ici : un récapitulatif gestionnaire porte
      // plusieurs dizaines de passages avec leurs lignes et dépasserait la limite,
      // rendant un 413 au lieu de l'email du soir. Relevé pour cette route seule,
      // qui n'est atteignable qu'avec le secret partagé.
      bodyLimit: 512 * 1024,
    },
    async (request, reply) => {
      // 1) Garde serveur-à-serveur — fail-closed si le secret n'est pas configuré.
      const expected = process.env.INTERNAL_INTAKE_SECRET;
      if (!expected) {
        return reply
          .status(503)
          .send({ error: "L'envoi transactionnel interne n'est pas configuré" });
      }
      const provided = request.headers["x-internal-secret"];
      if (typeof provided !== "string" || !secretMatches(provided, expected)) {
        return reply.status(401).send({ error: "Secret interne invalide" });
      }

      // 2) Validation stricte du corps (champs inconnus refusés).
      const result = notifySchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          error: "Données invalides",
          details: result.error.flatten().fieldErrors,
        });
      }
      const body = result.data;

      // 3) Envoi. Contrairement aux formulaires publics — best effort pour ne pas
      //    casser l'expérience d'un visiteur — l'appelant est ici un service qui a
      //    besoin de la vérité : un échec SMTP remonte en 502. L'API ne doit
      //    marquer le rappel comme envoyé (idempotence) que sur une réponse 200.
      try {
        const info = await deps.sendMail({
          from: `"Linge Serein" <${deps.mailFrom}>`,
          to: body.to,
          subject: body.subject,
          html: renderNotify(body),
        });
        return reply.status(200).send({ message: "Email envoyé", messageId: info.messageId });
      } catch (err) {
        app.log.error({ err, template: body.template }, "Échec de l'envoi transactionnel interne");
        return reply.status(502).send({ error: "L'envoi de l'email a échoué" });
      }
    },
  );

  // ─── Inbox admin (Basic Auth) ───
  // Liste des demandes de devis reçues, avec actions lu / archiver / supprimer.

  // GET /admin/devis — page HTML de l'inbox.
  app.get("/admin/devis", async (request, reply) => {
    if (!requireBasicAuth(request, reply)) return reply;
    return reply.type("text/html; charset=utf-8").send(renderInbox(listQuoteRequests()));
  });

  // Actions de mutation : redirigent vers l'inbox (303) après traitement.
  const idParamSchema = z.object({ id: z.string().uuid() });

  function handleAction(action: "read" | "archive" | "delete") {
    return async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!requireBasicAuth(request, reply)) return reply;
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).type("text/plain; charset=utf-8").send("Identifiant invalide.");
      }
      const { id } = parsed.data;
      if (action === "delete") {
        deleteQuoteRequest(id);
      } else {
        setQuoteStatus(id, action === "read" ? "read" : "archived");
      }
      return reply.redirect("/admin/devis", 303);
    };
  }

  app.post<{ Params: { id: string } }>("/admin/devis/:id/read", handleAction("read"));
  app.post<{ Params: { id: string } }>("/admin/devis/:id/archive", handleAction("archive"));
  app.post<{ Params: { id: string } }>("/admin/devis/:id/delete", handleAction("delete"));

  return app;
}
