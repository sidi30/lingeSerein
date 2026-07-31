import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmationEmail,
  notificationEmail,
  devisNotificationEmail,
  devisClientConfirmationEmail,
  rotationReminderClientEmail,
  rotationReminderOwnerEmail,
  rotationOverdueEmail,
  roundAssignedDriverEmail,
  orderConfirmationClientEmail,
  orderNotificationOwnerEmail,
} from "./templates.js";

// Regression: HTML / script injection via les champs du formulaire public.
// Avant correctif, ces payloads étaient interpolés bruts dans le HTML de
// l'email (XSS stocké lu par le propriétaire). Après correctif, ils sont
// échappés.
const xss = {
  name: "<script>alert(1)</script>",
  company: '"><img src=x onerror=alert(1)>',
  email: "attacker@evil.test",
  phone: "0102030405",
  message: "hello <b>bold</b> <script>steal()</script>\nline2",
};

test("notificationEmail escape les payloads HTML", () => {
  const html = notificationEmail(xss);
  assert.ok(!html.includes("<script>alert(1)</script>"), "name non échappé");
  // La balise <img onerror> ne peut plus se former : < et > sont échappés.
  assert.ok(!html.includes("<img src=x onerror"), "company non échappée");
  assert.ok(!html.includes("<script>steal()</script>"), "message non échappé");
  assert.ok(html.includes("&lt;script&gt;"), "entités HTML attendues");
  assert.ok(html.includes("&lt;img"), "balise img échappée attendue");
});

test("confirmationEmail escape les payloads HTML", () => {
  const html = confirmationEmail(xss);
  assert.ok(!html.includes("<script>alert(1)</script>"), "name non échappé");
  assert.ok(!html.includes("<script>steal()</script>"), "message non échappé");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("le saut de ligne du message devient <br> (pas de CR/LF brut)", () => {
  const html = notificationEmail(xss);
  assert.ok(html.includes("line2"));
  // le \n du message ne doit pas subsister tel quel dans le contenu rendu
  assert.ok(html.includes("<br>"));
});

// ─── Templates devis structuré ───

test("devisNotificationEmail échappe les payloads HTML (nom, désignation, note)", () => {
  const html = devisNotificationEmail({
    name: "<script>alert(1)</script>",
    company: '"><img src=x onerror=alert(1)>',
    email: "attacker@evil.test",
    phone: "0102030405",
    zone: "<b>zone</b>",
    note: "note <script>steal()</script>\nligne2",
    lignes: [{ designation: "<img src=x onerror=alert(1)>", qty: 3, unitCents: 1250 }],
    livraisonCents: 500,
    numero: "LSQ-2026-0007",
    quoteId: "abc-123",
    totalTTC: 4250,
  });
  assert.ok(!html.includes("<script>alert(1)</script>"), "nom non échappé");
  assert.ok(!html.includes("<img src=x onerror"), "désignation/company non échappée");
  assert.ok(!html.includes("<script>steal()</script>"), "note non échappée");
  assert.ok(html.includes("&lt;script&gt;"), "entités HTML attendues");
  // Montants formatés en EUR (centimes → euros) et lien admin présent.
  assert.ok(html.includes("12,50 €"), "prix unitaire formaté attendu");
  assert.ok(html.includes("42,50 €"), "total TTC formaté attendu");
  assert.ok(html.includes("https://admin.lingeserein.fr/devis/abc-123"), "lien admin attendu");
  assert.ok(html.includes("LSQ-2026-0007"), "numéro de devis attendu");
});

test("devisNotificationEmail signale l'absence de devis créé (pas d'id/numéro)", () => {
  const html = devisNotificationEmail({
    name: "Jean",
    company: "Hotel Test",
    email: "jean@test.fr",
    phone: "0102030405",
    lignes: [{ designation: "Serviettes", qty: 10, unitCents: 200 }],
    livraisonCents: 0,
  });
  assert.ok(!html.includes("admin.lingeserein.fr/devis/"), "aucun lien admin sans id");
  assert.ok(html.includes("saisir manuellement"), "avertissement de saisie manuelle attendu");
  // Total calculé côté template en l'absence de totalTTC API : 10 × 2,00 € = 20,00 €.
  assert.ok(html.includes("20,00 €"), "total calculé localement attendu");
});

test("devisClientConfirmationEmail échappe le nom et n'expose aucun détail", () => {
  const html = devisClientConfirmationEmail("<script>alert(1)</script>");
  assert.ok(!html.includes("<script>alert(1)</script>"), "nom non échappé");
  assert.ok(html.includes("&lt;script&gt;"));
  // Le visiteur ne doit voir aucun montant/ligne de devis.
  assert.ok(!html.includes("Total TTC"), "aucun détail de devis dans la confirmation visiteur");
});

// ─── Templates de rotation (API → /api/internal/notify) ───

// Les données viennent de l'API, donc d'un devis saisi à la main par
// l'exploitant : une désignation reste du texte libre et doit être échappée
// au même titre qu'un champ de formulaire public.
const xssLigne = { designation: "<img src=x onerror=alert(1)>", qty: 2 };

test("rotationReminderClientEmail échappe les données et demande une action", () => {
  const html = rotationReminderClientEmail({
    clientNom: "<script>alert(1)</script>",
    datePassage: "2026-08-03",
    creneau: "08:00-12:00",
    lignes: [xssLigne],
  });

  assert.ok(!html.includes("<script>alert(1)</script>"), "nom non échappé");
  assert.ok(!html.includes("<img src=x onerror"), "désignation non échappée");
  assert.ok(html.includes("&lt;script&gt;"), "entités HTML attendues");
  // L'action demandée est le cœur du message — un rappel qui n'en demande
  // aucune ne sert à rien.
  assert.ok(html.includes("sac fermé"), "consigne de préparation attendue");
  assert.ok(html.includes("08:00-12:00"), "créneau attendu");
  assert.ok(html.includes("06 85 21 82 70"), "numéro pour décaler attendu");
});

test("rotationReminderClientEmail rend la date en français, sans décalage de fuseau", () => {
  const html = rotationReminderClientEmail({
    clientNom: "Alice",
    datePassage: "2026-08-03",
    lignes: [],
  });
  // 3 août 2026 est un lundi. Une lecture en UTC puis un rendu en local
  // pourrait afficher « dimanche 2 » selon le fuseau.
  assert.ok(html.includes("lundi 3 août 2026"), "date française attendue");
});

test("rotationReminderClientEmail supporte l'absence de créneau et de lignes", () => {
  const html = rotationReminderClientEmail({
    clientNom: "Alice",
    datePassage: "2026-01-01",
    lignes: [],
  });
  assert.ok(html.includes("jeudi 1 janvier 2026"), "date française attendue");
  assert.ok(!html.includes("Créneau prévu"), "pas de bloc créneau vide");
  assert.ok(!html.includes("<th"), "pas de tableau d'articles vide");
});

test("rotationReminderOwnerEmail liste les passages et compte correctement", () => {
  const html = rotationReminderOwnerEmail({
    datePassage: "2026-08-03",
    passages: [
      {
        clientNom: "<b>Gîte</b> des Oliviers",
        clientAdresse: "12 rue des Vignes, Orange",
        formule: "ABONNEMENT",
        creneau: "08:00-12:00",
        lignes: [xssLigne],
      },
      {
        clientNom: "Hôtel Test",
        formule: "PONCTUEL",
        lignes: [{ designation: "Kit Lit", qty: 4 }],
      },
    ],
  });

  assert.ok(!html.includes("<b>Gîte</b>"), "nom client non échappé");
  assert.ok(!html.includes("<img src=x onerror"), "désignation non échappée");
  assert.ok(html.includes("2 passages"), "compte des passages attendu");
  assert.ok(html.includes("12 rue des Vignes, Orange"), "adresse attendue");
  // Les libellés de formule sont figés côté template, jamais saisis.
  assert.ok(html.includes("Pack Sérénité"), "libellé ABONNEMENT attendu");
  assert.ok(html.includes("Location ponctuelle"), "libellé PONCTUEL attendu");
});

test("rotationReminderOwnerEmail reste lisible sans aucun passage", () => {
  const html = rotationReminderOwnerEmail({ datePassage: "2026-08-03", passages: [] });
  assert.ok(html.includes("Aucun passage prévu demain"), "état vide explicite attendu");
  assert.ok(html.includes("0 passage"), "compte à zéro attendu");
});

test("rotationOverdueEmail affiche le retard et n'escalade qu'au-delà du seuil", () => {
  const base = {
    clientNom: "Gîte des Oliviers",
    clientAdresse: "12 rue des Vignes",
    dateReprisePrevue: "2026-08-03",
    lignes: [{ designation: "Kit Bain", qty: 4 }],
  };

  const sousSeuil = rotationOverdueEmail({ ...base, joursDeRetard: 2 });
  assert.ok(sousSeuil.includes("2 jours"), "retard affiché attendu");
  assert.ok(!sousSeuil.includes("Seuil d'escalade dépassé"), "pas d'escalade sous le seuil");

  const escalade = rotationOverdueEmail({
    ...base,
    joursDeRetard: 5,
    facturableRemplacement: true,
    montantRemplacementCents: 4250,
  });
  assert.ok(escalade.includes("Seuil d'escalade dépassé"), "bandeau d'escalade attendu");
  // formatEuroCents sépare le montant du symbole par une espace INSÉCABLE,
  // pour que le montant ne soit jamais coupé en fin de ligne. Une espace
  // ordinaire dans cette assertion la ferait échouer de façon invisible.
  assert.ok(escalade.includes("42,50 €"), "barème formaté attendu");
  // La facturation reste une décision humaine : le mail ne doit jamais laisser
  // croire qu'elle est automatique.
  assert.ok(escalade.includes("décision à prendre manuellement"), "réserve humaine attendue");
});

test("rotationOverdueEmail échappe le nom et la désignation", () => {
  const html = rotationOverdueEmail({
    clientNom: "<script>alert(1)</script>",
    dateReprisePrevue: "2026-08-03",
    joursDeRetard: 1,
    lignes: [xssLigne],
  });
  assert.ok(!html.includes("<script>alert(1)</script>"), "nom non échappé");
  assert.ok(!html.includes("<img src=x onerror"), "désignation non échappée");
  assert.ok(html.includes("1 jour"), "singulier attendu");
  assert.ok(!html.includes("1 jours"), "pas de pluriel à un jour");
});

// ─── Tournées ───

test("roundAssignedDriverEmail annonce une AFFECTATION, pas une reprise", () => {
  const html = roundAssignedDriverEmail({
    livreurNom: "Karim",
    datePassage: "2026-08-03",
    stopsCount: 7,
    zone: "Vaucluse Nord",
  });

  // Le contenu doit être propre à l'affectation : un livreur qui reçoit
  // « reprises prévues demain » pour une tournée lit un email trompeur.
  assert.ok(html.includes("tournée vous est affectée"), "objet de l'email absent");
  assert.ok(html.includes("Karim"));
  assert.ok(html.includes("lundi 3 août 2026"), "date en clair attendue");
  assert.ok(html.includes("7 arrêts"), "nombre d'arrêts absent");
  assert.ok(html.includes("Vaucluse Nord"), "secteur absent");
});

test("roundAssignedDriverEmail accorde le singulier et masque la zone absente", () => {
  const html = roundAssignedDriverEmail({
    livreurNom: "Karim",
    datePassage: "2026-08-03",
    stopsCount: 1,
  });

  assert.ok(html.includes("1 arrêt</strong> planifié"), "singulier attendu");
  assert.ok(!html.includes("Secteur :"), "aucune zone ne doit être inventée");
});

test("roundAssignedDriverEmail échappe le nom du livreur et la zone", () => {
  const html = roundAssignedDriverEmail({
    livreurNom: "<script>alert(1)</script>",
    datePassage: "2026-08-03",
    stopsCount: 2,
    zone: '"><img src=x onerror=alert(1)>',
  });

  assert.ok(!html.includes("<script>alert(1)</script>"), "nom non échappé");
  assert.ok(!html.includes("<img src=x onerror"), "zone non échappée");
  assert.ok(html.includes("&lt;script&gt;"));
});

// ─── Commandes ───

const COMMANDE_BASE = {
  clientNom: "Hôtel du Parc",
  orderNumber: "LNG-2026-ABCDEF",
  dateLivraison: "2026-08-03",
  lignes: [{ designation: "Kit Bain", qty: 2 }],
  sousTotalCents: 1500,
  livraisonCents: 1200,
  totalCents: 2700,
};

test("orderConfirmationClientEmail récapitule articles, date et montants", () => {
  const html = orderConfirmationClientEmail({ ...COMMANDE_BASE, creneau: "08:00-12:00" });

  assert.ok(html.includes("LNG-2026-ABCDEF"));
  assert.ok(html.includes("lundi 3 août 2026"));
  assert.ok(html.includes("08:00-12:00"));
  assert.ok(html.includes("Kit Bain"));
  // Montant seul : `formatEuroCents` sépare la valeur du « € » par une espace
  // INSÉCABLE, un détail de mise en forme dont ce test n'a pas à dépendre.
  assert.ok(html.includes("12,00"), "frais de livraison absents");
  assert.ok(html.includes("27,00"), "total absent");
});

test("orderConfirmationClientEmail ne dit « offerte » que si elle l'est vraiment", () => {
  const offerte = orderConfirmationClientEmail({
    ...COMMANDE_BASE,
    livraisonCents: 0,
    totalCents: 1500,
  });
  assert.ok(offerte.includes("offerte"));

  // Frais sur devis : 0 € ne vaut PAS gratuité. Annoncer « offerte » ici serait
  // un engagement commercial que personne n'a pris.
  const surDevis = orderConfirmationClientEmail({
    ...COMMANDE_BASE,
    livraisonCents: 0,
    totalCents: 1500,
    livraisonSurDevis: true,
  });
  assert.ok(!surDevis.includes("offerte"), "gratuité annoncée à tort");
  assert.ok(surDevis.includes("à confirmer"));
  assert.ok(surDevis.includes("Total (hors livraison)"), "total non qualifié");
});

test("orderNotificationOwnerEmail porte les coordonnées et alerte sur les frais à chiffrer", () => {
  const html = orderNotificationOwnerEmail({
    ...COMMANDE_BASE,
    clientEmail: "contact@hotel.test",
    clientTel: "0490000000",
    clientAdresse: "1 rue des Lices",
    livraisonCents: 0,
    totalCents: 1500,
    livraisonSurDevis: true,
    source: "MOBILE",
  });

  assert.ok(html.includes("contact@hotel.test"));
  assert.ok(html.includes("0490000000"));
  assert.ok(html.includes("1 rue des Lices"));
  assert.ok(html.includes("Application mobile"), "origine non libellée");
  assert.ok(html.includes("Frais de livraison à chiffrer"), "alerte absente");
});

test("orderNotificationOwnerEmail masque les coordonnées absentes", () => {
  const html = orderNotificationOwnerEmail(COMMANDE_BASE);

  // Un client sans email ni téléphone est le cas courant : aucune ligne vide.
  assert.ok(!html.includes("Téléphone"), "ligne téléphone vide affichée");
  assert.ok(!html.includes("Adresse"), "ligne adresse vide affichée");
  assert.ok(html.includes("Hôtel du Parc"));
});

test("les emails de commande échappent les désignations et le nom du client", () => {
  const payload = {
    ...COMMANDE_BASE,
    clientNom: "<script>alert(1)</script>",
    lignes: [{ designation: '"><img src=x onerror=alert(1)>', qty: 1 }],
  };

  for (const html of [
    orderConfirmationClientEmail(payload),
    orderNotificationOwnerEmail(payload),
  ]) {
    assert.ok(!html.includes("<script>alert(1)</script>"), "nom non échappé");
    assert.ok(!html.includes("<img src=x onerror"), "désignation non échappée");
    assert.ok(html.includes("&lt;script&gt;"));
  }
});

// Le logo est servi par la vitrine. Ce test verrouille sa présence dans TOUS les
// emails, avec un alt (repli quand le client bloque les images distantes) et une
// URL absolue en https — une URL relative ne veut rien dire dans un email.
test("tous les emails affichent le logo du site avec un alt et une URL absolue", () => {
  const htmls = [
    notificationEmail(xss),
    confirmationEmail(xss),
    devisClientConfirmationEmail("Alice"),
    devisNotificationEmail({
      name: "Alice",
      company: "Hotel Test",
      email: "a@test.fr",
      phone: "0102030405",
      lignes: [{ designation: "Kit Bain", qty: 2, unitCents: 1200 }],
      livraisonCents: 0,
    }),
    rotationReminderClientEmail({ clientNom: "Alice", datePassage: "2026-08-03", lignes: [] }),
    rotationReminderOwnerEmail({ datePassage: "2026-08-03", passages: [] }),
    rotationOverdueEmail({
      clientNom: "Alice",
      dateReprisePrevue: "2026-08-03",
      joursDeRetard: 4,
      lignes: [],
    }),
    roundAssignedDriverEmail({ livreurNom: "Karim", datePassage: "2026-08-03", stopsCount: 3 }),
    orderConfirmationClientEmail(COMMANDE_BASE),
    orderNotificationOwnerEmail(COMMANDE_BASE),
  ];

  for (const html of htmls) {
    assert.ok(
      html.includes('src="https://lingeserein.fr/images/logo_full.png"'),
      "logo absent ou URL inattendue",
    );
    assert.ok(html.includes('alt="Linge Serein"'), "alt manquant (repli images bloquées)");
  }
});
