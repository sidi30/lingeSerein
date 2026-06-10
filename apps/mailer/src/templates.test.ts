import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationEmail, notificationEmail } from "./templates.js";

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
