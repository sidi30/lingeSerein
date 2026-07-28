import nodemailer from "nodemailer";
import { buildApp } from "./app.js";

/**
 * Point d'entrée du service (`CMD ["node", "dist/server.js"]`).
 *
 * Ne contient QUE l'amorçage : lecture de l'environnement, transport SMTP et
 * écoute. Les routes vivent dans `app.ts`, importable et testable sans ouvrir
 * de port ni toucher au SMTP.
 */

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

const app = await buildApp({
  sendMail: (message) => transporter.sendMail(message),
  mailFrom: GMAIL_USER,
});

// Vérifie la connexion + l'auth SMTP au démarrage, SANS crasher le service
// (le /health doit rester up même si l'email est mal configuré). Gmail exige
// un App Password (2FA) : une auth avec un mot de passe classique échoue avec
// "534-5.7.9 Application-specific password required".
// Placé après buildApp : le rapport passe par app.log.
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

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
