import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmationEmail,
  notificationEmail,
  devisNotificationEmail,
  devisClientConfirmationEmail,
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

// Le logo est servi par la vitrine. Ce test verrouille sa présence dans les 5
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
  ];

  for (const html of htmls) {
    assert.ok(
      html.includes('src="https://lingeserein.fr/images/logo_full.png"'),
      "logo absent ou URL inattendue",
    );
    assert.ok(html.includes('alt="Linge Serein"'), "alt manquant (repli images bloquées)");
  }
});
