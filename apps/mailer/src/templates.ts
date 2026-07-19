const BRAND = {
  forest: "#1B5E20",
  forestLight: "#2E7D32",
  lavender: "#8B7CB8",
  lavender50: "#F5F3FA",
  cream: "#FDFBF7",
  gray: "#6B7280",
};

interface ContactData {
  name: string;
  company: string;
  email: string;
  phone: string;
  message: string;
}

/**
 * Échappe les caractères HTML dangereux pour empêcher toute injection
 * (XSS / HTML injection) dans les emails. Les valeurs proviennent d'un
 * formulaire public non authentifié et ne doivent JAMAIS être interpolées
 * brutes dans le markup. Le retour à la ligne du message est converti en <br>.
 */
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

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.cream};padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:30px 40px;background-color:${BRAND.forest};border-radius:16px 16px 0 0;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:1px;">
                Linge Serein
              </h1>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;">
                Votre linge, notre s\u00e9r\u00e9nit\u00e9
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:${BRAND.lavender50};padding:24px 40px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;">
              <p style="margin:0;font-size:12px;color:${BRAND.gray};text-align:center;line-height:1.6;">
                Linge Serein &mdash; Service de linge h\u00f4telier<br>
                Orange, Vaucluse &mdash; 06 85 21 82 70<br>
                lingeserein@gmail.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function confirmationEmail(data: ContactData): string {
  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Merci pour votre demande, ${esc(data.name)}
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Nous avons bien re\u00e7u votre demande de devis pour
      <strong style="color:${BRAND.forest};">${esc(data.company)}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Notre \u00e9quipe va \u00e9tudier vos besoins et vous recontacter
      <strong style="color:${BRAND.forest};">sous 24 heures ouvr\u00e9es</strong>
      pour vous proposer une offre personnalis\u00e9e.
    </p>
    <div style="background-color:${BRAND.lavender50};border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:4px solid ${BRAND.lavender};">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.forest};">Votre message :</p>
      <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.6;font-style:italic;">
        "${escMultiline(data.message)}"
      </p>
    </div>
    <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.7;">
      En attendant, n'h\u00e9sitez pas \u00e0 nous appeler au
      <a href="tel:+33685218270" style="color:${BRAND.forest};font-weight:600;text-decoration:none;">06 85 21 82 70</a>
      pour toute question.
    </p>
  `);
}

// ─── Demande de devis structurée (formulaire vitrine → /api/devis) ───

export interface DevisLineData {
  designation: string;
  qty: number;
  unitCents: number;
}

export interface DevisNotificationData {
  name: string;
  company: string;
  email: string;
  phone: string;
  zone?: string;
  note?: string;
  lignes: DevisLineData[];
  livraisonCents: number;
  /** Numéro LSQ-YYYY-NNNN si l'API a pu créer le devis. */
  numero?: string;
  /** Identifiant du devis créé (pour le lien admin). */
  quoteId?: string;
  /** Total TTC en centimes renvoyé par l'API, si disponible. */
  totalTTC?: number;
}

/**
 * Formate un montant en centimes vers une chaîne EUR lisible (ex. 1234 → "12,34 €").
 * Formatage manuel (pas d'Intl) pour rester déterministe quel que soit l'ICU
 * disponible dans l'image Node de prod. L'espace insécable évite la coupure.
 */
function formatEuroCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * Email de NOTIFICATION propriétaire pour une demande de devis structurée.
 * Toutes les valeurs issues du visiteur sont échappées (esc / escMultiline).
 * Les valeurs numériques (qty, montants) sont validées en amont (entiers zod)
 * puis formatées, donc jamais interpolées brutes depuis une source non fiable.
 */
export function devisNotificationEmail(data: DevisNotificationData): string {
  const rows = data.lignes
    .map((l, i) => {
      const lineTotal = l.qty * l.unitCents;
      const bg = i % 2 === 0 ? "#ffffff" : BRAND.lavender50;
      return `<tr>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb;background-color:${bg};">${esc(
          l.designation,
        )}</td>
        <td align="center" style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb;background-color:${bg};">${l.qty}</td>
        <td align="right" style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb;background-color:${bg};">${formatEuroCents(
          l.unitCents,
        )}</td>
        <td align="right" style="padding:10px 12px;font-size:14px;color:${BRAND.forest};font-weight:600;border-bottom:1px solid #e5e7eb;background-color:${bg};">${formatEuroCents(
          lineTotal,
        )}</td>
      </tr>`;
    })
    .join("");

  const computedTotal =
    data.lignes.reduce((s, l) => s + l.qty * l.unitCents, 0) + data.livraisonCents;
  const total = data.totalTTC ?? computedTotal;

  const numeroBlock = data.numero
    ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.gray};">Devis créé : <strong style="color:${BRAND.forest};">${esc(
        data.numero,
      )}</strong></p>`
    : `<p style="margin:0 0 4px;font-size:13px;color:#b45309;">⚠️ Devis non créé automatiquement — à saisir manuellement.</p>`;

  const adminLink = data.quoteId
    ? `<a href="https://admin.lingeserein.fr/devis/${esc(
        data.quoteId,
      )}" style="display:inline-block;background-color:${BRAND.forest};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:14px;font-weight:600;margin-top:8px;">Ouvrir le devis dans l'admin</a>`
    : "";

  const zoneRow = data.zone
    ? `<tr>
        <td style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Zone</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${esc(
            data.zone,
          )}</span>
        </td>
      </tr>`
    : "";

  const noteBlock = data.note
    ? `<div style="background-color:${BRAND.lavender50};border-radius:12px;padding:16px 20px;margin-bottom:24px;border-left:4px solid ${BRAND.lavender};">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.forest};">Message du client :</p>
        <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.6;font-style:italic;">${escMultiline(
          data.note,
        )}</p>
      </div>`
    : "";

  const livraisonRow =
    data.livraisonCents > 0
      ? `<tr>
          <td colspan="3" align="right" style="padding:8px 12px;font-size:13px;color:${BRAND.gray};">Livraison</td>
          <td align="right" style="padding:8px 12px;font-size:13px;color:#374151;">${formatEuroCents(
            data.livraisonCents,
          )}</td>
        </tr>`
      : "";

  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Nouvelle demande de devis (web)
    </h2>
    ${numeroBlock}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-radius:8px 8px 0 0;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Nom</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${esc(data.name)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Établissement</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${esc(
            data.company,
          )}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Email</span><br>
          <a href="mailto:${esc(
            data.email,
          )}" style="font-size:15px;color:${BRAND.forest};font-weight:600;text-decoration:none;">${esc(
            data.email,
          )}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Téléphone</span><br>
          <a href="tel:${esc(
            data.phone,
          )}" style="font-size:15px;color:${BRAND.forest};font-weight:600;text-decoration:none;">${esc(
            data.phone,
          )}</a>
        </td>
      </tr>
      ${zoneRow}
    </table>
    ${noteBlock}
    <h3 style="margin:0 0 12px;font-size:16px;color:${BRAND.forest};font-weight:600;">Détail de la demande</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background-color:${BRAND.forest};">
          <th align="left" style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Désignation</th>
          <th align="center" style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Qté</th>
          <th align="right" style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">P.U.</th>
          <th align="right" style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${livraisonRow}
        <tr>
          <td colspan="3" align="right" style="padding:14px 12px;font-size:15px;color:${BRAND.forest};font-weight:700;background-color:${BRAND.lavender50};">Total TTC</td>
          <td align="right" style="padding:14px 12px;font-size:16px;color:${BRAND.forest};font-weight:700;background-color:${BRAND.lavender50};">${formatEuroCents(
            total,
          )}</td>
        </tr>
      </tbody>
    </table>
    ${adminLink}
  `);
}

/**
 * Email de CONFIRMATION visiteur pour une demande de devis.
 * NE contient AUCUN détail du devis (montants, lignes) : juste un accusé de
 * réception rassurant. Seul le prénom/nom (échappé) est repris.
 */
export function devisClientConfirmationEmail(name: string): string {
  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Merci pour votre demande, ${esc(name)}
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Nous avons bien reçu votre demande de devis. Notre équipe revient vers vous
      <strong style="color:${BRAND.forest};">très vite</strong> avec une proposition
      personnalisée adaptée à vos besoins.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      En attendant, n'hésitez pas à nous appeler au
      <a href="tel:+33685218270" style="color:${BRAND.forest};font-weight:600;text-decoration:none;">06 85 21 82 70</a>
      pour toute question.
    </p>
  `);
}

export function notificationEmail(data: ContactData): string {
  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Nouvelle demande de devis
    </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-radius:8px 8px 0 0;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Nom</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${esc(data.name)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">\u00c9tablissement</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${esc(data.company)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Email</span><br>
          <a href="mailto:${esc(data.email)}" style="font-size:15px;color:${BRAND.forest};font-weight:600;text-decoration:none;">${esc(data.email)}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">T\u00e9l\u00e9phone</span><br>
          <a href="tel:${esc(data.phone)}" style="font-size:15px;color:${BRAND.forest};font-weight:600;text-decoration:none;">${esc(data.phone)}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-radius:0 0 8px 8px;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Message</span><br>
          <span style="font-size:15px;color:#374151;line-height:1.6;">${escMultiline(data.message)}</span>
        </td>
      </tr>
    </table>
    <a href="mailto:${esc(data.email)}?subject=Re: Demande de devis Linge Serein"
       style="display:inline-block;background-color:${BRAND.forest};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:14px;font-weight:600;">
      R\u00e9pondre au client
    </a>
  `);
}
