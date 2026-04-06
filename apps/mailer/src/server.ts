import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import nodemailer from "nodemailer";
import { z } from "zod";
import { confirmationEmail, notificationEmail } from "./templates.js";

const PORT = Number(process.env.PORT) || 3010;
const GMAIL_USER = process.env.GMAIL_USER!;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://lingeserein.fr";

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  company: z.string().min(2).max(200),
  email: z.string().email().max(254),
  phone: z.string().min(8).max(20),
  message: z.string().min(10).max(2000),
});

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: [ALLOWED_ORIGIN, "http://localhost:3002"],
  methods: ["POST"],
});

await app.register(rateLimit, {
  max: 5,
  timeWindow: "15 minutes",
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// Health check
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

  try {
    // Email de notification pour Linge Serein
    await transporter.sendMail({
      from: `"Linge Serein" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: data.email,
      subject: `Nouvelle demande de devis — ${data.company}`,
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
