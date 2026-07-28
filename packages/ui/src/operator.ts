/**
 * Identité légale du prestataire — source unique pour TOUS les PDF
 * (devis, contrat, bon de livraison, facture).
 *
 * Ce module ne dépend ni de React ni de @react-pdf : il est importé en relatif
 * par chaque module PDF, sans les coupler entre eux (les entrées `exports` du
 * package restent isolées pour le lazy-loading).
 */

/** Surcharge optionnelle de l'opérateur (réglages admin). */
export interface OperatorInfo {
  nom?: string;
  adresse?: string;
  tel?: string;
  email?: string;
  siret?: string | null;
  /** Remplace INTÉGRALEMENT la ligne de mentions légales composée par défaut. */
  legalMentions?: string | null;
}

/** Identité par défaut — Serein Act, exploitant la marque Linge Serein. */
export const PRESTATAIRE = {
  nomCommercial: "Linge Serein",
  baseline: "Votre linge, notre sérénité",
  raisonSociale: "Serein Act",
  representant: "Rayana Mahaman Moustapha",
  forme: "Entreprise individuelle",
  siren: "105 368 047",
  siret: "105 368 047 00012",
  ape: "9609Z (autres services personnels)",
  /** Code APE au format court, pour les documents où la place manque. */
  apeCourt: "9609Z",
  aprm: "96.01B-Q (laveries, blanchisserie et teintureries de détail)",
  rne: "02/06/2026",
  adresse: "343 rue Simone Weil, 84100 Orange, France",
  email: "lingeserein@gmail.com",
  tel: "07 53 56 95 48",
};

export type Prestataire = typeof PRESTATAIRE;

/**
 * Fusionne l'identité par défaut avec une éventuelle surcharge opérateur.
 * Les champs légaux non portés par {@link OperatorInfo} (raison sociale, APE,
 * date de RNE…) restent ceux de Serein Act : pour servir un autre opérateur,
 * c'est `legalMentions` qui prend le relais.
 */
export function resolvePrestataire(operator?: OperatorInfo): Prestataire {
  return {
    ...PRESTATAIRE,
    nomCommercial: operator?.nom ?? PRESTATAIRE.nomCommercial,
    adresse: operator?.adresse ?? PRESTATAIRE.adresse,
    email: operator?.email ?? PRESTATAIRE.email,
    tel: operator?.tel ?? PRESTATAIRE.tel,
    siret: operator?.siret ?? PRESTATAIRE.siret,
  };
}

/**
 * SIREN déduit du SIRET (ses 9 premiers chiffres, par définition) : si un
 * opérateur surcharge son SIRET, le SIREN imprimé suit au lieu de rester celui
 * de Serein Act. Repli sur la valeur par défaut si le SIRET est inexploitable.
 */
export function sirenFromSiret(siret: string): string {
  const digits = siret.replace(/\D/g, "").slice(0, 9);
  if (digits.length < 9) return PRESTATAIRE.siren;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

/**
 * Ligne de mentions légales imprimée en pied de devis et de facture.
 * `operator.legalMentions` la remplace intégralement.
 *
 * N'INCLUT PAS la mention de TVA : chaque document la porte déjà, conditionnée
 * à l'applicabilité de la TVA — l'inclure ici l'imprimerait deux fois.
 */
export function legalMentionsLine(operator?: OperatorInfo): string {
  const custom = operator?.legalMentions?.trim();
  if (custom) return custom;
  const soc = resolvePrestataire(operator);
  return (
    `${soc.nomCommercial} — ${soc.raisonSociale} — ${soc.representant} · ` +
    `SIREN ${sirenFromSiret(soc.siret)} · SIRET ${soc.siret} · APE ${soc.apeCourt} · ` +
    `${soc.adresse}. Immatriculée au RNE le ${soc.rne}.`
  );
}
