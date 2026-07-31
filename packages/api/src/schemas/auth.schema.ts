import { z } from "zod";
import { communeInseeSchema } from "./commune.schema.js";

/**
 * Refuse les caractères de CONTRÔLE, SAUF les sauts de ligne et tabulations.
 *
 * Ce n'est pas de la cosmétique de saisie. Ces champs repartent tels quels dans
 * les emails transactionnels, et le mailer refuse EN BLOC tout envoi qui en
 * porte un — c'est sa protection contre l'injection d'en-têtes SMTP, et elle ne
 * doit surtout pas être relâchée. Sans ce refus ici, un client pouvait éteindre
 * depuis son propre profil la confirmation de ses commandes ET l'alerte
 * « nouvelle commande » de l'exploitation, sans laisser la moindre trace.
 *
 * Le saut de ligne, lui, reste ACCEPTÉ : le champ « adresse » de l'application
 * mobile est multiligne, et une adresse postale tient rarement sur une ligne.
 * Il est replié sur une espace au moment de l'envoi (`pourMail`), pas ici.
 * Aucun clavier ne produit les autres : les refuser ne coûte rien à personne.
 */
const CARACTERE_DE_CONTROLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const sansCaractereDeControle = (valeur: string) => !CARACTERE_DE_CONTROLE.test(valeur);
const MESSAGE_CONTROLE = "Caractères non autorisés";

/**
 * Champs qu'un utilisateur a le droit de modifier LUI-MÊME sur son propre compte
 * (`PATCH /api/v1/auth/me`).
 *
 * ⚠️ Ce schéma est une frontière de PRIVILÈGE, pas une simple validation de
 * forme. Tout ce qui n'est pas listé ici est refusé, et ce refus est le seul
 * rempart entre « le client corrige son adresse » et « le client se nomme
 * administrateur ». D'où deux partis pris :
 *
 *   1. LISTE BLANCHE — on énumère ce qui est autorisé, jamais ce qui est
 *      interdit. Une liste noire oublie fatalement le champ ajouté au modèle
 *      Prisma six mois plus tard ; une liste blanche l'ignore par construction.
 *      Restent donc hors de portée : `role`, `operatorId`, `zoneId`, `isActive`,
 *      `deletedAt`, `isEmailVerified`, `rating`, `stockAlertThreshold`,
 *      `password`, `stripeCustomerId`, `notes`, et tout champ commercial.
 *
 *   2. `.strict()` — un champ inconnu fait ÉCHOUER la requête au lieu d'être
 *      silencieusement retiré. Un client qui tente `{"role":"ROLE_ADMIN"}` doit
 *      recevoir un 400 explicite : c'est une tentative d'élévation, elle doit
 *      être visible dans les logs, pas absorbée en douceur avec un 200 qui
 *      laisse croire que la demande a été prise en compte.
 *
 * L'EMAIL est volontairement HORS PÉRIMÈTRE. Le changer est un vecteur de
 * reprise de compte : `clients.service.ts` révoque d'ailleurs tous les refresh
 * tokens dès qu'un admin le modifie. Le faire ici en self-service exigerait en
 * plus une re-vérification de la nouvelle adresse (sinon on déplace l'identité
 * du compte vers une boîte non prouvée) et une déconnexion de toutes les
 * sessions. C'est un chantier à part entière — l'ouvrir à moitié serait pire que
 * de ne pas l'ouvrir.
 */
export const updateMyProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Le nom est obligatoire")
      .max(200, "Le nom ne doit pas dépasser 200 caractères")
      .refine(sansCaractereDeControle, MESSAGE_CONTROLE),

    // Les champs de contact acceptent `null` : un client doit pouvoir EFFACER un
    // numéro ou une adresse devenus faux, pas seulement les remplacer.
    phone: z
      .string()
      .trim()
      .max(20, "Le téléphone ne doit pas dépasser 20 caractères")
      .refine(sansCaractereDeControle, MESSAGE_CONTROLE)
      .nullable(),
    address: z
      .string()
      .trim()
      .max(500, "L'adresse ne doit pas dépasser 500 caractères")
      .refine(sansCaractereDeControle, MESSAGE_CONTROLE)
      .nullable(),
    city: z
      .string()
      .trim()
      .max(120, "La ville ne doit pas dépasser 120 caractères")
      .refine(sansCaractereDeControle, MESSAGE_CONTROLE)
      .nullable(),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, "Le code postal doit comporter 5 chiffres")
      .nullable(),

    /**
     * Commune de livraison — code INSEE, choisi dans la liste FERMÉE des
     * communes du Vaucluse. C'est ce champ, et lui seul, qui fixe le palier de
     * livraison : le déduire du `postalCode` (une chaîne libre écrite par le
     * client) permettait de s'attribuer la gratuité d'Orange en tapant 84100.
     *
     * Une commune hors périmètre est REFUSÉE en 400, pas ignorée : l'entreprise
     * ne livre pas hors du Vaucluse, et enregistrer l'adresse en silence
     * laisserait le client croire qu'il sera livré.
     *
     * NON `nullable`, à la différence des champs de contact : effacer sa commune
     * remettrait le tarif sur le repli par code postal, qui retient le palier le
     * MOINS CHER en cas d'ambiguïté. Un client d'Uchaux (84100, comme Orange)
     * n'aurait eu qu'à vider ce champ pour retrouver la gratuité d'Orange. On
     * corrige une commune, on ne la supprime pas.
     */
    communeInsee: communeInseeSchema,
    // Format imposé par le reste du système (seed, planning) : "08:00-10:00".
    preferredTimeSlot: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, "Le créneau doit être au format 08:00-10:00")
      .nullable(),
  })
  .partial()
  // `.strict()` sans message personnalisé : le message par défaut de Zod NOMME
  // les clés refusées, ce qu'un message figé perdrait. La route les reprend pour
  // en faire une phrase en français (`champsRefuses`).
  .strict()
  // Un corps vide passerait toutes les validations et déclencherait une écriture
  // et une trace d'audit pour rien.
  .refine((data) => Object.keys(data).length > 0, {
    message: "Aucun champ à modifier",
  });

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

/**
 * Commune de livraison à l'INSCRIPTION — complément de `registerSchema`, qui vit
 * dans `@lingengo/shared` et n'en porte pas.
 *
 * OPTIONNELLE, à dessein : l'application mobile déjà installée n'envoie pas
 * encore ce champ, et la rendre obligatoire refuserait en 400 toute inscription
 * depuis un binaire antérieur — un compte perdu pour un champ que l'utilisateur
 * n'a pas pu saisir. Absente, la fiche part sans commune et retombe sur le repli
 * par code postal, exactement comme les fiches créées avant ce sprint.
 * Fournie, elle est VALIDÉE : une commune hors Vaucluse est refusée, pas ignorée.
 */
export const registerCommuneSchema = z.object({
  communeInsee: communeInseeSchema.optional(),
});
