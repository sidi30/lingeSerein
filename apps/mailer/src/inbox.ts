import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { QuoteRequest, QuoteStatus } from "./store.js";

/**
 * Inbox admin des demandes de devis : authentification HTTP Basic + rendu HTML
 * server-side (aucun framework front). Servie sur api.lingeserein.fr derrière
 * Traefik (TLS), donc les identifiants Basic transitent chiffrés.
 */

const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const BRAND = {
  forest: "#1B5E20",
  forestLight: "#2E7D32",
  lavender: "#8B7CB8",
  lavender50: "#F5F3FA",
  cream: "#FDFBF7",
  gray: "#6B7280",
};

/** Comparaison à temps constant pour éviter les attaques temporelles. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Vérifie l'authentification Basic. Renvoie true si autorisé ; sinon écrit la
 * réponse 401/503 appropriée et renvoie false (l'appelant doit s'arrêter là).
 */
export function requireBasicAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!ADMIN_USER || !ADMIN_PASSWORD) {
    reply
      .status(503)
      .type("text/plain; charset=utf-8")
      .send("Inbox non configurée : définir ADMIN_USER et ADMIN_PASSWORD.");
    return false;
  }

  const header = request.headers.authorization ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      // Évalue les deux comparaisons pour ne pas court-circuiter sur le user.
      const okUser = safeEqual(user, ADMIN_USER);
      const okPass = safeEqual(pass, ADMIN_PASSWORD);
      if (okUser && okPass) return true;
    }
  }

  reply
    .header("WWW-Authenticate", 'Basic realm="Linge Serein — Devis", charset="UTF-8"')
    .status(401)
    .type("text/plain; charset=utf-8")
    .send("Authentification requise.");
  return false;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escMultiline(value: string): string {
  return esc(value).replace(/\r?\n/g, "<br>");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_META: Record<QuoteStatus, { label: string; bg: string; fg: string }> = {
  new: { label: "Nouveau", bg: "#FEF3C7", fg: "#92400E" },
  read: { label: "Lu", bg: "#DBEAFE", fg: "#1E40AF" },
  archived: { label: "Archivé", bg: "#E5E7EB", fg: "#374151" },
};

function renderCard(q: QuoteRequest): string {
  const meta = STATUS_META[q.status] ?? STATUS_META.new;
  const dimmed = q.status === "archived" ? "opacity:0.6;" : "";
  const replyHref = `mailto:${esc(q.email)}?subject=${encodeURIComponent("Re : Votre demande de devis — Linge Serein")}`;

  const actions: string[] = [];
  if (q.status !== "read") {
    actions.push(actionButton(q.id, "read", "Marquer lu", BRAND.forest));
  }
  if (q.status !== "archived") {
    actions.push(actionButton(q.id, "archive", "Archiver", BRAND.gray));
  } else {
    actions.push(actionButton(q.id, "read", "Désarchiver", BRAND.forest));
  }
  actions.push(
    `<form method="post" action="/admin/devis/${esc(q.id)}/delete" style="display:inline;margin:0;"
       onsubmit="return confirm('Supprimer définitivement cette demande ?');">
       <button type="submit" style="cursor:pointer;border:1px solid #FCA5A5;background:#FEF2F2;color:#B91C1C;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;">Supprimer</button>
     </form>`,
  );

  return `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;margin-bottom:14px;${dimmed}">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px;">
      <span style="font-weight:700;color:${BRAND.forest};font-size:16px;">${esc(q.company)}</span>
      <span style="background:${meta.bg};color:${meta.fg};border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${meta.label}</span>
      <span style="margin-left:auto;color:${BRAND.gray};font-size:12px;">${esc(formatDate(q.createdAt))}</span>
    </div>
    <div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:10px;">
      <strong>${esc(q.name)}</strong>
      &middot; <a href="mailto:${esc(q.email)}" style="color:${BRAND.forestLight};text-decoration:none;">${esc(q.email)}</a>
      &middot; <a href="tel:${esc(q.phone)}" style="color:${BRAND.forestLight};text-decoration:none;">${esc(q.phone)}</a>
    </div>
    <div style="background:${BRAND.lavender50};border-left:3px solid ${BRAND.lavender};border-radius:8px;padding:12px 14px;font-size:13px;color:#374151;line-height:1.6;white-space:normal;margin-bottom:12px;">
      ${escMultiline(q.message)}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      <a href="${replyHref}" style="background:${BRAND.forest};color:#fff;text-decoration:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;">Répondre</a>
      ${actions.join("\n")}
    </div>
  </div>`;
}

function actionButton(id: string, action: string, label: string, color: string): string {
  return `<form method="post" action="/admin/devis/${esc(id)}/${action}" style="display:inline;margin:0;">
    <button type="submit" style="cursor:pointer;border:1px solid ${color};background:#fff;color:${color};border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;">${esc(label)}</button>
  </form>`;
}

/** Page complète de l'inbox. */
export function renderInbox(requests: QuoteRequest[]): string {
  const active = requests.filter((q) => q.status !== "archived");
  const archived = requests.filter((q) => q.status === "archived");
  const newCount = requests.filter((q) => q.status === "new").length;

  const activeHtml =
    active.length > 0
      ? active.map(renderCard).join("\n")
      : `<p style="color:${BRAND.gray};font-size:14px;text-align:center;padding:40px 0;">Aucune demande pour l'instant.</p>`;

  const archivedHtml =
    archived.length > 0
      ? `<details style="margin-top:24px;">
           <summary style="cursor:pointer;color:${BRAND.gray};font-size:13px;font-weight:600;margin-bottom:12px;">Archivées (${archived.length})</summary>
           <div style="margin-top:12px;">${archived.map(renderCard).join("\n")}</div>
         </details>`
      : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Devis reçus — Linge Serein</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:760px;margin:0 auto;padding:24px 16px 60px;">
    <header style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div>
        <h1 style="margin:0;font-size:22px;color:${BRAND.forest};">Demandes de devis</h1>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.gray};">
          ${requests.length} au total &middot; <strong style="color:${BRAND.forest};">${newCount} nouvelle${newCount > 1 ? "s" : ""}</strong>
        </p>
      </div>
    </header>
    ${activeHtml}
    ${archivedHtml}
  </div>
</body>
</html>`;
}
