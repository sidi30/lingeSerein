import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildProfilePatch,
  EMPTY_PROFILE_FORM,
  hasProfileChanges,
  toFormValues,
  validateProfileForm,
  type ProfileFormValues,
} from "./profile-form.ts";

const form = (over: Partial<ProfileFormValues> = {}): ProfileFormValues => ({
  ...EMPTY_PROFILE_FORM,
  name: "Hôtel du Port",
  ...over,
});

describe("toFormValues", () => {
  it("transforme les champs jamais renseignés en chaînes vides", () => {
    const values = toFormValues({ name: "Gîte Bel Air", phone: null, city: "Nouakchott" });
    assert.equal(values.phone, "");
    assert.equal(values.city, "Nouakchott");
    assert.equal(values.postalCode, "");
  });

  it("tolère un profil pas encore chargé", () => {
    assert.deepEqual(toFormValues(undefined), EMPTY_PROFILE_FORM);
  });
});

describe("validateProfileForm", () => {
  it("accepte un formulaire réduit au nom", () => {
    assert.deepEqual(validateProfileForm(form()), {});
  });

  it("exige un nom non vide", () => {
    assert.equal(validateProfileForm(form({ name: "   " })).name, "Le nom est obligatoire.");
  });

  it("refuse un code postal qui n'a pas 5 chiffres", () => {
    assert.ok(validateProfileForm(form({ postalCode: "750" })).postalCode);
    assert.ok(validateProfileForm(form({ postalCode: "7500A" })).postalCode);
    assert.deepEqual(validateProfileForm(form({ postalCode: "75008" })), {});
  });

  it("refuse un créneau hors format serveur", () => {
    assert.ok(validateProfileForm(form({ preferredTimeSlot: "matin" })).preferredTimeSlot);
    assert.deepEqual(validateProfileForm(form({ preferredTimeSlot: "08:00-10:00" })), {});
  });

  it("laisse vider un champ facultatif", () => {
    // Champ vide = effacement demandé, pas faute de saisie.
    assert.deepEqual(
      validateProfileForm(form({ phone: "", postalCode: "", preferredTimeSlot: "" })),
      {},
    );
  });

  it("borne les longueurs comme le serveur", () => {
    assert.ok(validateProfileForm(form({ name: "a".repeat(201) })).name);
    assert.ok(validateProfileForm(form({ phone: "0".repeat(21) })).phone);
    assert.ok(validateProfileForm(form({ address: "a".repeat(501) })).address);
    assert.ok(validateProfileForm(form({ city: "a".repeat(121) })).city);
  });
});

describe("buildProfilePatch", () => {
  it("n'envoie que les champs modifiés", () => {
    const initial = form({ phone: "0600000000", city: "Rouen" });
    const current = form({ phone: "0611111111", city: "Rouen" });
    assert.deepEqual(buildProfilePatch(initial, current), { phone: "0611111111" });
  });

  it("envoie null pour un champ vidé, jamais une chaîne vide", () => {
    // Le serveur accepte `null` (effacement) mais rejette "" (regex du code
    // postal et du créneau) : envoyer "" produirait un 400 incompréhensible.
    const initial = form({ phone: "0600000000", postalCode: "75008" });
    const patch = buildProfilePatch(initial, form({ phone: "", postalCode: "" }));
    assert.deepEqual(patch, { phone: null, postalCode: null });
  });

  it("ignore les espaces ajoutés autour d'une valeur inchangée", () => {
    const initial = form({ city: "Rouen" });
    assert.deepEqual(buildProfilePatch(initial, form({ city: "  Rouen  " })), {});
  });

  it("n'envoie jamais un nom vide", () => {
    // Le serveur l'exige non vide ; l'écran signale déjà l'erreur.
    assert.deepEqual(buildProfilePatch(form(), form({ name: "  " })), {});
  });

  it("renvoie un corps vide quand rien n'a bougé", () => {
    const values = form({ phone: "0600000000" });
    assert.deepEqual(buildProfilePatch(values, values), {});
    assert.equal(hasProfileChanges(values, values), false);
  });

  it("détecte un changement dès qu'un champ diffère", () => {
    assert.equal(hasProfileChanges(form(), form({ address: "12 rue des Lilas" })), true);
  });
});
