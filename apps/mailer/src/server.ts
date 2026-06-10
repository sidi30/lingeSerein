import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import nodemailer from "nodemailer";
import { z } from "zod";
import { confirmationEmail, notificationEmail } from "./templates.js";

const PORT = Number(process.env.PORT) || 3010;
const GMAIL_USER = process.env.GMAIL_USER!;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD!;

// Échec rapide au démarrage si la configuration sensible est absente,
// plutôt que de tourner avec un transport SMTP cassé.
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  // eslint-disable-next-line no-console
  console.error("GMAIL_USER / GMAIL_APP_PASSWORD manquants — arrêt.");
  process.exit(1);
}

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
});

await app.register(cors, {
  origin: [...ALLOWED_ORIGINS, "http://localhost:3002"],
  methods: ["POST"],
});

await app.register(rateLimit, {
  max: 5,
  timeWindow: "15 minutes",
});

// NOTE délivrabilité : le VPS de prod bloque les ports SMTP sortants 25 et 465
// (timeout). Seul le 587 (submission / STARTTLS) est ouvert. On utilise donc
// port 587 + secure:false + requireTLS (STARTTLS) pour garantir l'envoi tout
// en restant chiffré de bout en bout.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Vérifie la connexion + l'auth SMTP au démarrage, SANS crasher le service
// (le /health doit rester up même si l'email est mal configuré). Gmail exige
// un App Password (2FA) : une auth avec un mot de passe classique échoue avec
// "534-5.7.9 Application-specific password required".
transporter
  .verify()
  .then(() => app.log.info("SMTP prêt (smtp.gmail.com:587 STARTTLS)"))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    app.log.error(
      "SMTP NON opérationnel — les emails ne partiront pas. " +
        "Vérifier que GMAIL_APP_PASSWORD est un App Password Google (2FA requise) " +
        "et que le port 587 est ouvert en sortie. Détail: " +
        msg,
    );
  });

// Health check — réponse minimale, aucune info d'environnement divulguée.
app.get("/health", async () => ({ status: "ok" }));

// Contact form
app.post("/api/contact", async (request, reply) => {
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

  try {
    // Email de notification pour Linge Serein
    await transporter.sendMail({
      from: `"Linge Serein" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: data.email,
      subject: `Nouvelle demande de devis — ${safeCompany}`,
      html: notificationEmail(data),
    });

    // Email de confirmation pour le client
    await transporter.sendMail({
      from: `"Linge Serein" <${GMAIL_USER}>`,
      to: data.email,
      subject: "Linge Serein — Nous avons bien reçu votre demande",
      html: confirmationEmail(data),
    });

    return reply.status(200).send({ message: "Demande envoyée avec succès" });
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: "Erreur lors de l'envoi" });
  }
});

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
