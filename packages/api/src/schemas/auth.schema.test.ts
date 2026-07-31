/**
 * Frontière de privilège de `PATCH /api/v1/auth/me`.
 *
 * Ce schéma n'est pas de la validation de confort : c'est le seul rempart entre
 * « le client corrige son adresse » et « le client se nomme administrateur ».
 * Une régression ici ne casse aucun écran, ne lève aucune alerte et ne se voit
 * dans les logs qu'après coup — d'où ces tests, qui échouent tous sur un schéma
 * simplement `z.object({...})` sans `.strict()`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { updateMyProfileSchema } from "./auth.schema.ts";

/** Champs dont l'écriture par l'utilisateur lui-même serait une élévation. */
const CHAMPS_INTERDITS: Record<string, unknown> = {
  role: "ROLE_ADMIN",
  operatorId: "11111111-1111-1111-1111-111111111111",
  zoneId: "22222222-2222-2222-2222-222222222222",
  isActive: false,
  deletedAt: null,
  isEmailVerified: true,
  rating: 5,
  stockAlertThreshold: 0,
  password: "Motdepasse!1",
  passwordHash: "$2b$10$peuimporte",
  email: "voleur@example.com",
  stripeCustomerId: "cus_123",
  notes: "note interne",
  companyName: "Autre société",
  id: "33333333-3333-3333-3333-333333333333",
  userId: "33333333-3333-3333-3333-333333333333",
};

describe("updateMyProfileSchema — liste blanche", () => {
  it("accepte les six champs autorisés", () => {
    const parsed = updateMyProfileSchema.safeParse({
      name: "Hôtel du Pont",
      phone: "0490000000",
      address: "12 rue des Teinturiers",
      city: "Avignon",
      postalCode: "84000",
      preferredTimeSlot: "08:00-10:00",
    });

    assert.equal(parsed.success, true);
  });

  it("accepte une modification partielle (un seul champ)", () => {
    const parsed = updateMyProfileSchema.safeParse({ phone: "0612345678" });
    assert.equal(parsed.success, true);
  });

  for (const [champ, valeur] of Object.entries(CHAMPS_INTERDITS)) {
    it(`REJETTE une tentative d'écriture sur « ${champ} »`, () => {
      const parsed = updateMyProfileSchema.safeParse({ phone: "0612345678", [champ]: valeur });

      assert.equal(
        parsed.success,
        false,
        `« ${champ} » doit être refusé, pas retiré en silence : un 200 laisserait ` +
          `croire à l'appelant que sa demande a été prise en compte`,
      );
    });
  }

  it("signale explicitement le champ refusé plutôt que de le laisser passer", () => {
    const parsed = updateMyProfileSchema.safeParse({ role: "ROLE_SUPER_ADMIN" });

    assert.equal(parsed.success, false);
    if (parsed.success) return;

    const messages = JSON.stringify(parsed.error.flatten());
    assert.ok(messages.includes("role"), "l'erreur doit nommer le champ interdit");
  });

  it("ne conserve jamais un champ interdit dans la sortie typée", () => {
    // Filet de sécurité contre un futur passage en `.passthrough()` ou un
    // `.strip()` qui rendrait le rejet silencieux : même si le parse venait à
    // réussir, `data` ne doit pas porter `role`.
    const parsed = updateMyProfileSchema.safeParse({ name: "Hôtel", role: "ROLE_ADMIN" });

    if (parsed.success) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(parsed.data, "role"),
        "un champ interdit ne doit jamais atteindre le `data` de Prisma",
      );
    }
  });
});

describe("updateMyProfileSchema — commune de livraison", () => {
  // Orange (84087) et Uchaux (84135) partagent le code postal 84100 sans avoir
  // le même tarif : c'est le code INSEE, et lui seul, qui fixe le palier.
  it("accepte une commune du Vaucluse", () => {
    assert.equal(updateMyProfileSchema.safeParse({ communeInsee: "84087" }).success, true);
    assert.equal(updateMyProfileSchema.safeParse({ communeInsee: "84135" }).success, true);
  });

  it("REFUSE une commune hors Vaucluse plutôt que de l'enregistrer", () => {
    // Marseille : code INSEE parfaitement valide, hors périmètre de livraison.
    // L'accepter en silence laisserait le client croire qu'il sera livré.
    const parsed = updateMyProfileSchema.safeParse({ communeInsee: "13055" });
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    assert.match(JSON.stringify(parsed.error.flatten()), /Vaucluse/);
  });

  it("refuse une valeur qui n'est pas un code de la liste fermée", () => {
    for (const invalide of ["84", "Orange", "00000", "  ", "84087 84135"]) {
      assert.equal(
        updateMyProfileSchema.safeParse({ communeInsee: invalide }).success,
        false,
        `commune « ${invalide} »`,
      );
    }
  });

  it("refuse d'EFFACER la commune", () => {
    // Effacer remettrait le tarif sur la déduction par code postal, qui retient
    // le palier le moins cher en cas d'ambiguïté : un client d'Uchaux (84100,
    // comme Orange) n'aurait eu qu'à vider ce champ pour retrouver la gratuité.
    assert.equal(updateMyProfileSchema.safeParse({ communeInsee: null }).success, false);
    assert.equal(updateMyProfileSchema.safeParse({ communeInsee: "" }).success, false);
  });

  it("nettoie les espaces autour du code", () => {
    const parsed = updateMyProfileSchema.safeParse({ communeInsee: " 84087 " });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.communeInsee, "84087");
  });
});

describe("updateMyProfileSchema — validation de forme", () => {
  it("refuse un corps vide (écriture et audit pour rien)", () => {
    const parsed = updateMyProfileSchema.safeParse({});
    assert.equal(parsed.success, false);
  });

  it("autorise l'effacement d'un champ de contact devenu faux", () => {
    const parsed = updateMyProfileSchema.safeParse({ phone: null, address: null });
    assert.equal(parsed.success, true);
  });

  it("refuse un nom vide", () => {
    assert.equal(updateMyProfileSchema.safeParse({ name: "" }).success, false);
    assert.equal(updateMyProfileSchema.safeParse({ name: "   " }).success, false);
  });

  it("refuse un nom null — le compte doit toujours porter un nom", () => {
    assert.equal(updateMyProfileSchema.safeParse({ name: null }).success, false);
  });

  it("refuse un code postal qui n'est pas 5 chiffres", () => {
    for (const invalide of ["840", "8400A", "  ", "084000"]) {
      assert.equal(
        updateMyProfileSchema.safeParse({ postalCode: invalide }).success,
        false,
        `code postal « ${invalide} »`,
      );
    }
  });

  it("nettoie les espaces avant de valider (copier-coller depuis un mail)", () => {
    const parsed = updateMyProfileSchema.safeParse({ postalCode: " 84000 ", name: "  Hôtel  " });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.postalCode, "84000");
    assert.equal(parsed.data.name, "Hôtel");
  });

  it("refuse un caractère de contrôle dans un champ de texte libre", () => {
    // Ces valeurs repartent telles quelles dans les emails transactionnels, que
    // le mailer refuse EN BLOC dès qu'il croise un caractère de contrôle (sa
    // protection contre l'injection d'en-têtes SMTP). Sans ce refus, un client
    // éteignait depuis son profil la confirmation de ses propres commandes ET
    // l'alerte « nouvelle commande » de l'exploitation — sans aucune trace.
    for (const [champ, valeur] of [
      ["name", "H\u0001\u00f4tel du Pont"],
      ["phone", "0490\u007f000000"],
      ["address", "12 rue des\u001b Teinturiers"],
      ["city", "Avi\u0000gnon"],
    ] as const) {
      assert.equal(
        updateMyProfileSchema.safeParse({ [champ]: valeur }).success,
        false,
        `« ${champ} » ne doit pas accepter de caractère de contrôle`,
      );
    }
  });

  it("garde le saut de ligne d'une adresse — le champ mobile est multiligne", () => {
    // Le refuser casserait un cas parfaitement légitime : une adresse postale
    // tient rarement sur une ligne. Il est replié sur une espace à l'ENVOI de
    // l'email (`pourMail`), pas rejeté à la saisie.
    const parsed = updateMyProfileSchema.safeParse({
      address: "12 avenue de la R\u00e9publique\nB\u00e2timent C",
    });
    assert.equal(parsed.success, true);
  });

  it("refuse un créneau hors format 08:00-10:00", () => {
    assert.equal(updateMyProfileSchema.safeParse({ preferredTimeSlot: "matin" }).success, false);
    assert.equal(updateMyProfileSchema.safeParse({ preferredTimeSlot: "8h-10h" }).success, false);
    assert.equal(
      updateMyProfileSchema.safeParse({ preferredTimeSlot: "08:00-10:00" }).success,
      true,
    );
  });

  it("borne la longueur des champs sur les limites de la base", () => {
    assert.equal(updateMyProfileSchema.safeParse({ name: "x".repeat(201) }).success, false);
    assert.equal(updateMyProfileSchema.safeParse({ phone: "0".repeat(21) }).success, false);
    assert.equal(updateMyProfileSchema.safeParse({ city: "x".repeat(121) }).success, false);
  });
});
