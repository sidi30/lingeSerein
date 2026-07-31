/**
 * Logo affiché en en-tête des emails : le fichier servi par la vitrine, donc
 * exactement le même que la navbar du site. Surchargeable par env si l'asset
 * déménage un jour (CDN dédié, bucket…) sans toucher au code.
 */
const LOGO_URL = process.env.LOGO_URL || "https://lingeserein.fr/images/logo_full.png";
const LOGO_DISPLAY_WIDTH = 150;

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
          <!--
            Bandeau CLAIR (et non vert for\u00eat comme avant) : le logo du site a un
            texte vert fonc\u00e9, il serait illisible sur du vert. Le liser\u00e9 forest
            en bas conserve la couleur de marque.
            width explicite + display:block : sans \u00e7a Outlook r\u00e9serve une taille
            arbitraire. L'alt sert de repli quand le client bloque les images.
          -->
          <tr>
            <td align="center" style="padding:28px 40px 22px;background-color:#ffffff;border:1px solid #e5e7eb;border-bottom:3px solid ${BRAND.forest};border-radius:16px 16px 0 0;">
              <img src="${LOGO_URL}" alt="Linge Serein" width="${LOGO_DISPLAY_WIDTH}"
                   style="display:block;width:${LOGO_DISPLAY_WIDTH}px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;">
              <p style="margin:10px 0 0;font-size:13px;color:${BRAND.gray};letter-spacing:0.5px;">
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

// ─── Rotations de linge (API → /api/internal/notify) ───

/**
 * Ligne de linge concernée par un passage. `qty` est un entier validé en amont
 * par zod : jamais interpolée depuis une source non fiable.
 */
export interface RotationLigneData {
  designation: string;
  qty: number;
}

/** Régime contractuel de la rotation — libellés figés, jamais saisis. */
const FORMULE_LABELS: Record<string, string> = {
  PONCTUEL: "Location ponctuelle",
  ABONNEMENT: "Pack Sérénité",
};

const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * Formate une date « AAAA-MM-JJ » en français lisible (« lundi 3 août 2026 »).
 *
 * Pas d'`Intl` — même raison que {@link formatEuroCents} : le rendu doit être
 * identique quel que soit l'ICU embarqué dans l'image Node de production.
 * La date est décomposée à la main puis reconstruite en heure LOCALE : passer
 * la chaîne à `new Date()` la lirait en UTC et pourrait décaler le jour de la
 * semaine d'un cran selon le fuseau.
 */
function formatDateFr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return esc(isoDate);
  const date = new Date(y, m - 1, d);
  return `${JOURS_FR[date.getDay()]} ${d} ${MOIS_FR[m - 1]} ${y}`;
}

/** Tableau des articles d'un passage. Toute désignation est échappée. */
function lignesTable(lignes: RotationLigneData[]): string {
  const rows = lignes
    .map((l, i) => {
      const bg = i % 2 === 0 ? "#ffffff" : BRAND.lavender50;
      return `<tr>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb;background-color:${bg};">${esc(
          l.designation,
        )}</td>
        <td align="center" style="padding:10px 12px;font-size:14px;color:${BRAND.forest};font-weight:600;border-bottom:1px solid #e5e7eb;background-color:${bg};">${l.qty}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background-color:${BRAND.forest};">
          <th align="left" style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Article</th>
          <th align="center" style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Qté</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export interface RotationReminderClientData {
  clientNom: string;
  /** Date du passage au format AAAA-MM-JJ. */
  datePassage: string;
  /** Créneau annoncé, ex. « 08:00-12:00 ». */
  creneau?: string;
  lignes: RotationLigneData[];
}

/**
 * Rappel CLIENT envoyé la veille du passage (J-1 à 18h).
 *
 * Le message demande une ACTION précise (sortir le linge sale en sac fermé)
 * plutôt que d'informer : c'est ce qui fait la différence entre un rappel utile
 * et un rappel ignoré. La porte de sortie (« besoin de décaler ») est mise en
 * avant pour éviter le passage à vide, bien plus coûteux qu'un report.
 */
export function rotationReminderClientEmail(data: RotationReminderClientData): string {
  const creneauBlock = data.creneau
    ? `<p style="margin:0 0 16px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
         Créneau prévu : <strong style="color:${BRAND.forest};">${esc(data.creneau)}</strong>
       </p>`
    : "";

  const lignesBlock = data.lignes.length > 0 ? lignesTable(data.lignes) : "";

  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Votre passage est prévu demain, ${esc(data.clientNom)}
    </h2>
    <div style="background-color:${BRAND.lavender50};border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:4px solid ${BRAND.lavender};">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.forest};text-transform:uppercase;letter-spacing:0.5px;">Date du passage</p>
      <p style="margin:0;font-size:18px;color:${BRAND.forest};font-weight:700;">${formatDateFr(
        data.datePassage,
      )}</p>
    </div>
    ${creneauBlock}
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Merci de <strong style="color:${BRAND.forest};">préparer votre linge sale dans un sac fermé</strong>
      avant notre arrivée. Nous le récupérons et vous déposons votre linge propre dans le même passage.
    </p>
    ${lignesBlock}
    <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.7;">
      Besoin de décaler ? Appelez-nous au
      <a href="tel:+33685218270" style="color:${BRAND.forest};font-weight:600;text-decoration:none;">06 85 21 82 70</a>
      — un report coûte toujours moins cher qu'un passage à vide.
    </p>
  `);
}

export interface RotationPassageData {
  clientNom: string;
  clientAdresse?: string;
  /** PONCTUEL ou ABONNEMENT. */
  formule?: string;
  creneau?: string;
  lignes: RotationLigneData[];
}

export interface RotationReminderOwnerData {
  /** Date des passages au format AAAA-MM-JJ. */
  datePassage: string;
  passages: RotationPassageData[];
}

/**
 * Récapitulatif GESTIONNAIRE des passages du lendemain (J-1 à 18h).
 *
 * Sert de feuille de route imprimable : une section par client, avec l'adresse
 * et les articles à charger. Les passages arrivent dans l'ordre fourni par
 * l'API — le tri (par tournée, par zone) est une décision d'appelant.
 */
export function rotationReminderOwnerEmail(data: RotationReminderOwnerData): string {
  const count = data.passages.length;

  const blocks = data.passages
    .map((p, i) => {
      const adresse = p.clientAdresse
        ? `<p style="margin:0 0 2px;font-size:14px;color:${BRAND.gray};line-height:1.6;">${esc(
            p.clientAdresse,
          )}</p>`
        : "";
      const formule = p.formule
        ? `<span style="display:inline-block;background-color:${BRAND.lavender50};color:${BRAND.forest};font-size:12px;font-weight:600;padding:3px 10px;border-radius:50px;">${esc(
            FORMULE_LABELS[p.formule] ?? p.formule,
          )}</span>`
        : "";
      const creneau = p.creneau
        ? `<p style="margin:6px 0 0;font-size:13px;color:${BRAND.gray};">Créneau : <strong style="color:${BRAND.forest};">${esc(
            p.creneau,
          )}</strong></p>`
        : "";

      return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
          <p style="margin:0 0 6px;font-size:16px;color:${BRAND.forest};font-weight:700;">
            ${i + 1}. ${esc(p.clientNom)}
          </p>
          ${adresse}
          ${formule}
          ${creneau}
          <div style="margin-top:14px;">${
            p.lignes.length > 0
              ? lignesTable(p.lignes)
              : `<p style="margin:0;font-size:13px;color:${BRAND.gray};font-style:italic;">Aucun article renseigné.</p>`
          }</div>
        </div>`;
    })
    .join("");

  const body =
    count > 0
      ? blocks
      : `<p style="margin:0;font-size:15px;color:${BRAND.gray};line-height:1.7;">Aucun passage prévu demain.</p>`;

  return layout(`
    <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Passages de demain
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      ${formatDateFr(data.datePassage)} &mdash;
      <strong style="color:${BRAND.forest};">${count} passage${count > 1 ? "s" : ""}</strong>
    </p>
    ${body}
  `);
}

export interface RotationOverdueData {
  clientNom: string;
  clientAdresse?: string;
  /** Date de reprise prévue au format AAAA-MM-JJ. */
  dateReprisePrevue: string;
  joursDeRetard: number;
  lignes: RotationLigneData[];
  /** Vrai au-delà du seuil d'escalade : le remplacement devient facturable. */
  facturableRemplacement?: boolean;
  /** Montant du barème de remplacement, en centimes, si l'appelant le fournit. */
  montantRemplacementCents?: number;
}

/**
 * Alerte GESTIONNAIRE — linge non restitué (cron quotidien 09h).
 *
 * Le bandeau d'escalade n'apparaît qu'au-delà du seuil de tolérance et rappelle
 * que la facturation reste une DÉCISION HUMAINE : cet email signale, il ne
 * déclenche rien.
 */
export function rotationOverdueEmail(data: RotationOverdueData): string {
  const jours = data.joursDeRetard;

  const adresse = data.clientAdresse
    ? `<p style="margin:0 0 16px;font-size:14px;color:${BRAND.gray};line-height:1.6;">${esc(
        data.clientAdresse,
      )}</p>`
    : "";

  const bareme =
    data.montantRemplacementCents !== undefined
      ? ` Barème de remplacement applicable : <strong>${formatEuroCents(
          data.montantRemplacementCents,
        )}</strong>.`
      : "";

  const escalade = data.facturableRemplacement
    ? `<div style="background-color:#fef3c7;border-radius:12px;padding:18px 22px;margin-bottom:24px;border-left:4px solid #b45309;">
         <p style="margin:0;font-size:14px;color:#7c2d12;line-height:1.7;">
           <strong>Seuil d'escalade dépassé.</strong> Le linge est réputé non restitué :
           son remplacement devient facturable.${bareme}
           La facturation reste une décision à prendre manuellement.
         </p>
       </div>`
    : "";

  return layout(`
    <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Linge non restitué &mdash; ${esc(data.clientNom)}
    </h2>
    ${adresse}
    <div style="background-color:${BRAND.lavender50};border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:4px solid ${BRAND.lavender};">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.forest};text-transform:uppercase;letter-spacing:0.5px;">Reprise attendue le</p>
      <p style="margin:0 0 10px;font-size:16px;color:${BRAND.forest};font-weight:700;">${formatDateFr(
        data.dateReprisePrevue,
      )}</p>
      <p style="margin:0;font-size:15px;color:${BRAND.gray};">
        Retard : <strong style="color:#b45309;">${jours} jour${jours > 1 ? "s" : ""}</strong>
      </p>
    </div>
    ${escalade}
    <h3 style="margin:0 0 12px;font-size:16px;color:${BRAND.forest};font-weight:600;">Articles concernés</h3>
    ${
      data.lignes.length > 0
        ? lignesTable(data.lignes)
        : `<p style="margin:0 0 24px;font-size:14px;color:${BRAND.gray};font-style:italic;">Aucun article renseigné.</p>`
    }
    <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.7;">
      Contacter le client au plus tôt pour convenir d'une reprise.
    </p>
  `);
}

// ─── Tournées (API → /api/internal/notify) ───

export interface RoundAssignedDriverData {
  livreurNom: string;
  /** Jour de la tournée au format AAAA-MM-JJ. */
  datePassage: string;
  /** Nombre d'arrêts planifiés sur la tournée. */
  stopsCount: number;
  /** Secteur couvert, quand la tournée en porte un. */
  zone?: string;
}

/**
 * Affectation d'une TOURNÉE à un livreur.
 *
 * Gabarit propre à ce cas, et non un « email générique » réutilisé : dire à un
 * livreur « reprises prévues demain » pour lui annoncer une affectation serait
 * trompeur, et un email trompeur coûte plus cher qu'une absence d'email.
 *
 * N'affirme QUE ce que la charge utile contient — qui, quel jour, combien
 * d'arrêts, quel secteur. Ni horaires, ni adresses, ni ordre de passage : ces
 * informations vivent dans l'application, et les inventer ici ferait partir un
 * planning faux que le livreur suivrait.
 */
export function roundAssignedDriverEmail(data: RoundAssignedDriverData): string {
  const stops = data.stopsCount;

  const zoneBlock = data.zone
    ? `<p style="margin:10px 0 0;font-size:15px;color:${BRAND.gray};">
         Secteur : <strong style="color:${BRAND.forest};">${esc(data.zone)}</strong>
       </p>`
    : "";

  // Une tournée sans arrêt est anormale : le dire au livreur vaut mieux que de
  // lui afficher « 0 arrêt » sans commentaire, qu'il lirait comme un bug.
  const arretsBlock =
    stops > 0
      ? `<p style="margin:0;font-size:15px;color:${BRAND.gray};">
           <strong style="color:${BRAND.forest};">${stops} arrêt${stops > 1 ? "s" : ""}</strong> planifié${
             stops > 1 ? "s" : ""
           }
         </p>`
      : `<p style="margin:0;font-size:15px;color:${BRAND.gray};">
           Aucun arrêt n'est encore planifié sur cette tournée — le détail vous parviendra
           dans l'application.
         </p>`;

  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Une tournée vous est affectée, ${esc(data.livreurNom)}
    </h2>
    <div style="background-color:${BRAND.lavender50};border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:4px solid ${BRAND.lavender};">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.forest};text-transform:uppercase;letter-spacing:0.5px;">Jour de la tournée</p>
      <p style="margin:0 0 10px;font-size:18px;color:${BRAND.forest};font-weight:700;">${formatDateFr(
        data.datePassage,
      )}</p>
      ${arretsBlock}
      ${zoneBlock}
    </div>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Le détail des arrêts — adresses, ordre de passage et articles à charger — est
      dans l'application, onglet <strong style="color:${BRAND.forest};">Tournée</strong>.
      Pensez à vérifier votre chargement avant de partir.
    </p>
    <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.7;">
      Un empêchement ? Prévenez-nous au plus tôt au
      <a href="tel:+33685218270" style="color:${BRAND.forest};font-weight:600;text-decoration:none;">06 85 21 82 70</a>
      pour que la tournée soit réaffectée.
    </p>
  `);
}

// ─── Commandes (API → /api/internal/notify) ───

export interface OrderLigneData {
  designation: string;
  qty: number;
}

interface OrderMontants {
  /** Sous-total des ARTICLES, hors livraison. */
  sousTotalCents: number;
  livraisonCents: number;
  /** Sous-total + livraison. */
  totalCents: number;
  /**
   * Frais de livraison sans tarif public (hors zone, urgence Flash) : 0 € ne
   * vaut PAS gratuité, le montant reste à confirmer.
   */
  livraisonSurDevis?: boolean;
}

export interface OrderConfirmationClientData extends OrderMontants {
  clientNom: string;
  orderNumber: string;
  /** Date de livraison souhaitée, au format AAAA-MM-JJ. */
  dateLivraison: string;
  creneau?: string;
  lignes: OrderLigneData[];
}

/**
 * Bloc de totaux d'une commande.
 *
 * La ligne de livraison ne dit « offerte » que lorsqu'elle l'est RÉELLEMENT :
 * quand les frais sont sur devis, elle annonce « à confirmer » et le total est
 * marqué « hors livraison ». Afficher 0 € en gratuité pour une course hors zone
 * serait un engagement commercial que personne n'a pris.
 */
function orderTotauxTable(m: OrderMontants): string {
  const livraisonValeur = m.livraisonSurDevis
    ? `<span style="color:#b45309;font-weight:600;">à confirmer</span>`
    : m.livraisonCents > 0
      ? formatEuroCents(m.livraisonCents)
      : `<span style="color:${BRAND.forestLight};font-weight:600;">offerte</span>`;

  const totalLabel = m.livraisonSurDevis ? "Total (hors livraison)" : "Total";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tbody>
        <tr>
          <td style="padding:10px 12px;font-size:14px;color:${BRAND.gray};background-color:#ffffff;">Sous-total des articles</td>
          <td align="right" style="padding:10px 12px;font-size:14px;color:#374151;background-color:#ffffff;">${formatEuroCents(
            m.sousTotalCents,
          )}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:14px;color:${BRAND.gray};background-color:${BRAND.lavender50};">Livraison</td>
          <td align="right" style="padding:10px 12px;font-size:14px;color:#374151;background-color:${BRAND.lavender50};">${livraisonValeur}</td>
        </tr>
        <tr>
          <td style="padding:14px 12px;font-size:15px;color:${BRAND.forest};font-weight:700;background-color:${BRAND.lavender50};border-top:1px solid #e5e7eb;">${totalLabel}</td>
          <td align="right" style="padding:14px 12px;font-size:16px;color:${BRAND.forest};font-weight:700;background-color:${BRAND.lavender50};border-top:1px solid #e5e7eb;">${formatEuroCents(
            m.totalCents,
          )}</td>
        </tr>
      </tbody>
    </table>`;
}

/**
 * Confirmation CLIENT à l'enregistrement de sa commande.
 *
 * Accuse réception et récapitule ce qui a été commandé, pour quelle date et à
 * quel prix. La commande est ENREGISTRÉE, pas encore confirmée : le texte ne
 * promet donc aucune livraison ferme.
 */
export function orderConfirmationClientEmail(data: OrderConfirmationClientData): string {
  const creneauBlock = data.creneau
    ? `<p style="margin:10px 0 0;font-size:15px;color:${BRAND.gray};">
         Créneau souhaité : <strong style="color:${BRAND.forest};">${esc(data.creneau)}</strong>
       </p>`
    : "";

  const livraisonSurDevisBlock = data.livraisonSurDevis
    ? `<div style="background-color:#fef3c7;border-radius:12px;padding:16px 20px;margin-bottom:24px;border-left:4px solid #b45309;">
         <p style="margin:0;font-size:14px;color:#7c2d12;line-height:1.7;">
           Votre adresse sort de nos secteurs à tarif public : les
           <strong>frais de livraison vous seront confirmés</strong> avant toute
           préparation. Ils ne sont pas inclus dans le total ci-dessus.
         </p>
       </div>`
    : "";

  return layout(`
    <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Votre commande est enregistrée, ${esc(data.clientNom)}
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Commande <strong style="color:${BRAND.forest};">${esc(data.orderNumber)}</strong>
    </p>
    <div style="background-color:${BRAND.lavender50};border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:4px solid ${BRAND.lavender};">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.forest};text-transform:uppercase;letter-spacing:0.5px;">Livraison souhaitée</p>
      <p style="margin:0;font-size:18px;color:${BRAND.forest};font-weight:700;">${formatDateFr(
        data.dateLivraison,
      )}</p>
      ${creneauBlock}
    </div>
    <h3 style="margin:0 0 12px;font-size:16px;color:${BRAND.forest};font-weight:600;">Votre commande</h3>
    ${
      data.lignes.length > 0
        ? lignesTable(data.lignes)
        : `<p style="margin:0 0 24px;font-size:14px;color:${BRAND.gray};font-style:italic;">Aucun article renseigné.</p>`
    }
    ${orderTotauxTable(data)}
    ${livraisonSurDevisBlock}
    <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.7;">
      Nous revenons vers vous pour confirmer le passage. Une question ? Appelez-nous au
      <a href="tel:+33685218270" style="color:${BRAND.forest};font-weight:600;text-decoration:none;">06 85 21 82 70</a>.
    </p>
  `);
}

/** Origine de la commande — libellés figés, jamais saisis. */
const ORDER_SOURCE_LABELS: Record<string, string> = {
  MOBILE: "Application mobile",
  QUOTE_CONVERSION: "Conversion d'un devis",
  MANUAL: "Saisie manuelle",
};

export interface OrderNotificationOwnerData extends OrderMontants {
  clientNom: string;
  clientEmail?: string;
  clientTel?: string;
  clientAdresse?: string;
  orderNumber: string;
  dateLivraison: string;
  creneau?: string;
  lignes: OrderLigneData[];
  /** MOBILE, QUOTE_CONVERSION ou MANUAL. */
  source?: string;
}

/**
 * Signalement GESTIONNAIRE d'une nouvelle commande.
 *
 * Porte le détail complet ET les coordonnées du client : c'est ce qui permet de
 * rappeler sans ouvrir l'admin, notamment quand les frais de livraison restent
 * à chiffrer.
 */
export function orderNotificationOwnerEmail(data: OrderNotificationOwnerData): string {
  const ligne = (label: string, valeur: string, alt: boolean) =>
    `<tr>
        <td style="padding:12px 16px;background-color:${
          alt ? BRAND.lavender50 : "#ffffff"
        };border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">${label}</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${valeur}</span>
        </td>
      </tr>`;

  const contact = [
    ligne("Client", esc(data.clientNom), false),
    data.clientEmail
      ? ligne(
          "Email",
          `<a href="mailto:${esc(data.clientEmail)}" style="color:${BRAND.forest};text-decoration:none;">${esc(
            data.clientEmail,
          )}</a>`,
          true,
        )
      : "",
    data.clientTel
      ? ligne(
          "Téléphone",
          `<a href="tel:${esc(data.clientTel)}" style="color:${BRAND.forest};text-decoration:none;">${esc(
            data.clientTel,
          )}</a>`,
          false,
        )
      : "",
    data.clientAdresse ? ligne("Adresse", esc(data.clientAdresse), true) : "",
    data.source
      ? ligne("Origine", esc(ORDER_SOURCE_LABELS[data.source] ?? data.source), false)
      : "",
  ].join("");

  const creneau = data.creneau
    ? ` &mdash; créneau <strong style="color:${BRAND.forest};">${esc(data.creneau)}</strong>`
    : "";

  const alerteFrais = data.livraisonSurDevis
    ? `<div style="background-color:#fef3c7;border-radius:12px;padding:16px 20px;margin-bottom:24px;border-left:4px solid #b45309;">
         <p style="margin:0;font-size:14px;color:#7c2d12;line-height:1.7;">
           <strong>Frais de livraison à chiffrer.</strong> Aucun tarif public ne s'applique
           (hors zone ou urgence Flash) : le montant de 0 € porté par la commande ne vaut
           pas gratuité. À confirmer au client avant préparation.
         </p>
       </div>`
    : "";

  return layout(`
    <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Nouvelle commande ${esc(data.orderNumber)}
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Livraison souhaitée le
      <strong style="color:${BRAND.forest};">${formatDateFr(data.dateLivraison)}</strong>${creneau}
    </p>
    ${alerteFrais}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      ${contact}
    </table>
    <h3 style="margin:0 0 12px;font-size:16px;color:${BRAND.forest};font-weight:600;">Articles commandés</h3>
    ${
      data.lignes.length > 0
        ? lignesTable(data.lignes)
        : `<p style="margin:0 0 24px;font-size:14px;color:${BRAND.gray};font-style:italic;">Aucun article renseigné.</p>`
    }
    ${orderTotauxTable(data)}
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
