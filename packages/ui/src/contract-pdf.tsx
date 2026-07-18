/**
 * Rendu PDF des contrats Linge Serein (dérivés d'un devis accepté).
 * Importer via import dynamique (lazy) pour ne pas charger @react-pdf/renderer
 * dans le bundle SSR :
 *   const { downloadContractPdf } = await import("@lingengo/ui/contract-pdf");
 *
 * NON utilisable côté serveur (Node/Fastify) — contient du JSX React.
 *
 * Deux variantes rendues selon `data.type` :
 *  - ABONNEMENT : contrat Pack Sérénité (4 pages, articles 1..15 + annexe barème) ;
 *  - PONCTUEL   : contrat de prestation ponctuelle (sans engagement), qui conserve
 *                 les clauses protectrices (propriété, responsabilité, barème…).
 */

import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import type { ContractData } from "@lingengo/shared";

/* ─── Opérateur / identité légale (override optionnel, mirroir de devis-pdf) ─── */

export interface OperatorInfo {
  nom?: string;
  adresse?: string;
  tel?: string;
  email?: string;
  siret?: string | null;
  legalMentions?: string | null;
}

/* ─── Prestataire (identité légale — source de vérité, défaut Serein Act) ─── */

const PRESTATAIRE = {
  nomCommercial: "Linge Serein",
  raisonSociale: "Serein Act",
  representant: "Rayana Mahaman Moustapha",
  forme: "Entreprise individuelle",
  siren: "105 368 047",
  siret: "105 368 047 00012",
  ape: "9609Z (autres services personnels)",
  aprm: "96.01B-Q (laveries, blanchisserie et teintureries de détail)",
  rne: "02/06/2026",
  adresse: "343 rue Simone Weil, 84100 Orange, France",
  email: "lingeserein@gmail.com",
  tel: "07 53 56 95 48",
};

/**
 * Résout l'identité du prestataire en fusionnant un éventuel override
 * `operator`. Les champs légaux (SIREN, forme, représentant…) restent ceux
 * de Serein Act tant qu'ils ne sont pas fournis — OperatorInfo ne les porte pas.
 */
function resolvePrestataire(operator?: OperatorInfo) {
  return {
    ...PRESTATAIRE,
    nomCommercial: operator?.nom ?? PRESTATAIRE.nomCommercial,
    adresse: operator?.adresse ?? PRESTATAIRE.adresse,
    email: operator?.email ?? PRESTATAIRE.email,
    tel: operator?.tel ?? PRESTATAIRE.tel,
    siret: operator?.siret ?? PRESTATAIRE.siret,
  };
}

/* ─── Barème de remplacement du linge (valeur à neuf, indicatif) ─── */

const BAREME_REMPLACEMENT: { article: string; valeur: string }[] = [
  { article: "Drap de bain 70 × 150 cm", valeur: "22,00 €" },
  { article: "Serviette de toilette 50 × 90 cm", valeur: "10,00 €" },
  { article: "Petite serviette / gant 30 × 50 cm", valeur: "5,00 €" },
  { article: "Tapis de bain 50 × 70 cm", valeur: "9,00 €" },
  { article: "Housse de couette", valeur: "39,00 €" },
  { article: "Drap housse", valeur: "25,00 €" },
  { article: "Taie d'oreiller", valeur: "7,00 €" },
];

/* ─── Branding ─── */

const FOREST = "#1b5e20";
const LAVENDER = "#5e5488";
const INK = "#1f2937";
const GRAY = "#6b7280";
const LINE = "#e5e0f0";
const CREAM = "#faf8f3";

/* ─── Helpers ─── */

function euros(cents: number): string {
  if (!Number.isFinite(cents)) return "0,00 €";
  return (
    (cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 44,
    paddingBottom: 60,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
    lineHeight: 1.5,
  },
  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: FOREST,
  },
  logo: { width: 120, height: 42, objectFit: "contain" },
  logoFallback: { fontFamily: "Times-Bold", fontSize: 18, color: FOREST },
  baseline: { fontSize: 7.5, color: GRAY, marginTop: 2 },
  titleWrap: { alignItems: "flex-end", maxWidth: 230 },
  docTitle: { fontFamily: "Times-Bold", fontSize: 15, color: FOREST, textAlign: "right" },
  docSub: { fontSize: 8, color: GRAY, marginTop: 3, textAlign: "right" },
  metaStrong: { color: INK, fontFamily: "Helvetica-Bold" },
  /* Parties */
  partiesIntro: { fontSize: 8.5, color: GRAY, marginBottom: 10 },
  parties: { flexDirection: "row", gap: 14, marginBottom: 14 },
  partyBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    padding: 11,
    backgroundColor: CREAM,
  },
  partyLabel: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 10, color: INK, marginBottom: 2 },
  partyLine: { fontSize: 8, color: GRAY, marginBottom: 1 },
  designation: { fontSize: 8.5, color: INK, marginBottom: 12, lineHeight: 1.5 },
  /* Articles */
  article: { marginBottom: 9 },
  articleTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: FOREST,
    marginBottom: 3,
  },
  articleText: { fontSize: 8.5, color: INK, lineHeight: 1.5, textAlign: "justify" },
  bullet: { flexDirection: "row", marginTop: 2, paddingLeft: 6 },
  bulletDot: { width: 10, fontSize: 8.5, color: LAVENDER },
  bulletText: { flex: 1, fontSize: 8.5, color: INK, lineHeight: 1.5, textAlign: "justify" },
  /* Encadré synthèse */
  synthBox: {
    borderWidth: 1,
    borderColor: FOREST,
    borderRadius: 6,
    backgroundColor: "#f0f6f0",
    padding: 11,
    marginBottom: 14,
  },
  synthTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: FOREST,
    marginBottom: 6,
  },
  synthRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  synthLabel: { fontSize: 8.5, color: GRAY },
  synthValue: { fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold" },
  synthNote: { fontSize: 7.5, color: LAVENDER, marginTop: 6, fontFamily: "Helvetica-Oblique" },
  /* Table barème + prestations */
  tableHead: {
    flexDirection: "row",
    backgroundColor: FOREST,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    marginTop: 4,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#ffffff" },
  tRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  tRowAlt: { backgroundColor: CREAM },
  td: { fontSize: 8, color: INK },
  colArticle: { flex: 1 },
  colValeur: { width: 90, textAlign: "right" },
  /* Table prestations ponctuelles */
  colDesignation: { flex: 1, paddingRight: 8 },
  colQty: { width: 40, textAlign: "right" },
  colPu: { width: 70, textAlign: "right" },
  colTotal: { width: 70, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: FOREST,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#ffffff" },
  totalValue: { fontFamily: "Times-Bold", fontSize: 12, color: "#ffffff" },
  /* Signatures */
  signWrap: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 24 },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    padding: 11,
    minHeight: 120,
  },
  signLabel: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  signName: { fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  signSub: { fontSize: 7.5, color: GRAY, marginBottom: 6 },
  signMention: { fontSize: 7.5, color: INK, marginTop: 6, fontFamily: "Helvetica-Oblique" },
  signImg: { width: 130, height: 52, objectFit: "contain", marginTop: 4 },
  signLine: {
    marginTop: 8,
    height: 40,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  /* Mentions légales */
  legalBox: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
  },
  legalText: { fontSize: 7, color: GRAY, lineHeight: 1.5 },
  /* Footer */
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: GRAY },
  footerStrong: { color: FOREST, fontFamily: "Helvetica-Bold" },
  pageNum: { fontSize: 7, color: GRAY },
});

/* ─── Blocs réutilisables ─── */

function Article({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View style={styles.article} wrap={false}>
      <Text style={styles.articleTitle}>{titre}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.articleText}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function Footer({ soc }: { soc: ReturnType<typeof resolvePrestataire> }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        <Text style={styles.footerStrong}>{soc.nomCommercial}</Text> · {soc.raisonSociale} · SIRET{" "}
        {soc.siret}
      </Text>
      <Text
        style={styles.pageNum}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

/** Bloc « Parties » commun aux deux variantes. */
function Parties({
  soc,
  data,
  clientNom,
}: {
  soc: ReturnType<typeof resolvePrestataire>;
  data: ContractData;
  clientNom: string;
}) {
  return (
    <>
      <Text style={styles.partiesIntro}>Entre les soussignés :</Text>
      <View style={styles.parties}>
        <View style={styles.partyBox}>
          <Text style={styles.partyLabel}>Le Prestataire</Text>
          <Text style={styles.partyName}>
            {soc.nomCommercial} — {soc.raisonSociale}
          </Text>
          <Text style={styles.partyLine}>{soc.forme}</Text>
          <Text style={styles.partyLine}>Représentée par {soc.representant}</Text>
          <Text style={styles.partyLine}>SIRET {soc.siret}</Text>
          <Text style={styles.partyLine}>{soc.adresse}</Text>
          <Text style={styles.partyLine}>
            {soc.tel} · {soc.email}
          </Text>
        </View>
        <View style={styles.partyBox}>
          <Text style={styles.partyLabel}>Le Client</Text>
          <Text style={styles.partyName}>{clientNom}</Text>
          {!!data.client.etablissement && !!data.client.nom && (
            <Text style={styles.partyLine}>Représenté par {data.client.nom}</Text>
          )}
          {!!data.client.identifiant && (
            <Text style={styles.partyLine}>{data.client.identifiant}</Text>
          )}
          {!!data.client.adresse && <Text style={styles.partyLine}>{data.client.adresse}</Text>}
          {!!data.client.tel && <Text style={styles.partyLine}>Tél. {data.client.tel}</Text>}
          {!!data.client.email && <Text style={styles.partyLine}>{data.client.email}</Text>}
        </View>
      </View>
    </>
  );
}

/** Annexe barème (commune aux deux variantes). */
function AnnexeBareme() {
  return (
    <Article titre="Annexe — Barème de remplacement du linge (valeur à neuf)">
      <P>
        Valeurs indicatives appliquées en cas de perte, vol, non-restitution ou détérioration
        irréversible d&apos;un article :
      </P>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colArticle]}>Article</Text>
        <Text style={[styles.th, styles.colValeur]}>Valeur de remplacement</Text>
      </View>
      {BAREME_REMPLACEMENT.map((b, i) => (
        <View
          key={b.article}
          style={[styles.tRow, ...(i % 2 === 1 ? [styles.tRowAlt] : [])]}
          wrap={false}
        >
          <Text style={[styles.td, styles.colArticle]}>{b.article}</Text>
          <Text style={[styles.td, styles.colValeur]}>{b.valeur}</Text>
        </View>
      ))}
    </Article>
  );
}

/** Bloc signatures (commun aux deux variantes). */
function Signatures({
  soc,
  data,
  clientNom,
}: {
  soc: ReturnType<typeof resolvePrestataire>;
  data: ContractData;
  clientNom: string;
}) {
  return (
    <>
      <Article titre="Signatures">
        <P>
          Fait à {data.lieu || "Orange"}, le {data.date || "…"}, en deux exemplaires originaux, dont
          un remis à chaque Partie. Chaque Partie reconnaît avoir pris connaissance de
          l&apos;ensemble des clauses du présent contrat et de son annexe, et les accepter sans
          réserve.
        </P>
      </Article>

      <View style={styles.signWrap} wrap={false}>
        <View style={styles.signBox}>
          <Text style={styles.signLabel}>Le Prestataire</Text>
          <Text style={styles.signName}>
            {soc.nomCommercial} — {soc.raisonSociale}
          </Text>
          <Text style={styles.signSub}>{soc.representant}</Text>
          {data.signatureSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.signatureSrc} style={styles.signImg} />
          ) : (
            <View style={styles.signLine} />
          )}
          <Text style={styles.signMention}>« Lu et approuvé »</Text>
        </View>
        <View style={styles.signBox}>
          <Text style={styles.signLabel}>Le Client</Text>
          <Text style={styles.signName}>{clientNom}</Text>
          {!!data.client.nom && !!data.client.etablissement && (
            <Text style={styles.signSub}>{data.client.nom}</Text>
          )}
          <View style={styles.signLine} />
          <Text style={styles.signMention}>
            Précédée de la mention manuscrite « Lu et approuvé — bon pour accord »
          </Text>
        </View>
      </View>

      <View style={styles.legalBox}>
        <Text style={styles.legalText}>
          {soc.nomCommercial} est le nom commercial de l&apos;entreprise individuelle{" "}
          {soc.raisonSociale} — {soc.representant}. SIREN {soc.siren} · SIRET du siège {soc.siret} ·
          Code APE {soc.ape} · Code APRM {soc.aprm}. Siège : {soc.adresse}. Entreprise immatriculée
          au Registre National des Entreprises le {soc.rne}. TVA non applicable, art. 293 B du CGI.
        </Text>
      </View>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Variante ABONNEMENT — Pack Sérénité (4 pages)
   ══════════════════════════════════════════════════════════════════════════ */

function AbonnementBody({
  data,
  logoSrc,
  soc,
  clientNom,
}: {
  data: ContractData;
  logoSrc?: string;
  soc: ReturnType<typeof resolvePrestataire>;
  clientNom: string;
}) {
  const prix = euros(data.prixMensuelCents);
  const depot = data.depotGarantieCents > 0 ? euros(data.depotGarantieCents) : null;
  const showSource = !!data.devisNumero && !!data.nbMensualitesDevis;

  return (
    <>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>{soc.nomCommercial}</Text>
            )}
            <Text style={styles.baseline}>Location &amp; entretien de linge hôtelier</Text>
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.docTitle}>CONTRAT D&apos;ABONNEMENT</Text>
            <Text style={styles.docSub}>Pack Sérénité — location &amp; entretien de linge</Text>
            <Text style={styles.docSub}>
              N° <Text style={styles.metaStrong}>{data.numero || "—"}</Text>
            </Text>
          </View>
        </View>

        <Parties soc={soc} data={data} clientNom={clientNom} />

        <Text style={styles.designation}>
          Ci-après désignés ensemble « les Parties ». Il a été convenu et arrêté ce qui suit. Le
          présent contrat lie un professionnel (le Prestataire) à un client agissant dans le cadre
          de son activité de location de logements meublés de courte durée (le Client).
        </Text>

        {/* Encadré synthèse */}
        <View style={styles.synthBox} wrap={false}>
          <Text style={styles.synthTitle}>Conditions essentielles de l&apos;abonnement</Text>
          <View style={styles.synthRow}>
            <Text style={styles.synthLabel}>Formule</Text>
            <Text style={styles.synthValue}>Pack Sérénité</Text>
          </View>
          <View style={styles.synthRow}>
            <Text style={styles.synthLabel}>Prix mensuel</Text>
            <Text style={styles.synthValue}>{prix} / mois</Text>
          </View>
          <View style={styles.synthRow}>
            <Text style={styles.synthLabel}>Dotation mensuelle incluse</Text>
            <Text style={styles.synthValue}>
              {data.kitsBain} kits bain + {data.kitsLit} kits lit + {data.livraisonsIncluses}{" "}
              livraison &amp; reprise
            </Text>
          </View>
          <View style={styles.synthRow}>
            <Text style={styles.synthLabel}>Prise d&apos;effet</Text>
            <Text style={styles.synthValue}>{data.dateDebut || "—"}</Text>
          </View>
          <View style={styles.synthRow}>
            <Text style={styles.synthLabel}>Engagement initial</Text>
            <Text style={styles.synthValue}>
              {data.engagementMois} mois, puis préavis {data.preavisJours} j
            </Text>
          </View>
          {depot && (
            <View style={styles.synthRow}>
              <Text style={styles.synthLabel}>Dépôt de garantie</Text>
              <Text style={styles.synthValue}>{depot}</Text>
            </View>
          )}
          {showSource && (
            <Text style={styles.synthNote}>
              Établi d&apos;après le devis n° {data.devisNumero}, couvrant {data.nbMensualitesDevis}{" "}
              mensualité{(data.nbMensualitesDevis ?? 0) > 1 ? "s" : ""}.
            </Text>
          )}
        </View>

        {/* Article 1 — Objet */}
        <Article titre="Article 1 — Objet du contrat">
          <P>
            Le présent contrat a pour objet la fourniture par le Prestataire, sous la forme
            d&apos;un abonnement mensuel dénommé « Pack Sérénité », d&apos;une prestation de
            location et d&apos;entretien de linge hôtelier au bénéfice du Client, comprenant la mise
            à disposition de linge propre, sa livraison, la reprise du linge sale et son entretien
            en blanchisserie professionnelle, dans les conditions définies ci-après.
          </P>
          {showSource && (
            <P>
              Le présent contrat fait suite au devis n° {data.devisNumero} accepté par le Client et
              couvre {data.nbMensualitesDevis} mensualité
              {(data.nbMensualitesDevis ?? 0) > 1 ? "s" : ""} d&apos;abonnement.
            </P>
          )}
        </Article>

        {/* Article 2 — Contenu de l'abonnement */}
        <Article titre="Article 2 — Contenu et dotation mensuelle">
          <P>
            Chaque mensualité d&apos;abonnement donne droit à une dotation forfaitaire comprenant :
          </P>
          <Bullet>
            {data.kitsBain} kits bain (drap de bain, serviette de toilette et tapis de bain) et{" "}
            {data.kitsLit} kits lit (housse de couette, drap housse et taie(s)) par mois ;
          </Bullet>
          <Bullet>
            {data.livraisonsIncluses} livraison et reprise incluse(s) par mois, sur la zone
            desservie ;
          </Bullet>
          <Bullet>l&apos;entretien complet du linge en blanchisserie professionnelle.</Bullet>
          <P>
            La dotation mensuelle est forfaitaire, nominative et non cessible. Les kits ou services
            non consommés au cours d&apos;un mois ne sont ni reportés sur le mois suivant, ni
            remboursés. Tout kit, article ou livraison supplémentaire au-delà de la dotation
            mensuelle incluse est commandé séparément et facturé au tarif normal en vigueur (à titre
            indicatif : kit bain 7,50 €, kit lit 16,50 € par rotation), en sus de l&apos;abonnement.
          </P>
        </Article>

        {/* Article 3 — Durée et engagement */}
        <Article titre="Article 3 — Durée, engagement et résiliation">
          <P>
            Le contrat prend effet le {data.dateDebut || "…"} pour une durée initiale ferme de{" "}
            {data.engagementMois} mois (période d&apos;engagement). Il se renouvelle ensuite par
            tacite reconduction, par périodes successives d&apos;un (1) mois.
          </P>
          <P>
            À l&apos;issue de la période d&apos;engagement initiale, chacune des Parties peut
            résilier le contrat à tout moment, moyennant un préavis de {data.preavisJours} jours
            notifié par écrit (courrier ou courriel). Aucune résiliation ne peut prendre effet avant
            le terme de la période d&apos;engagement initiale.
          </P>
          <P>
            En cas de résiliation par le Client avant le terme de la période d&apos;engagement
            initiale, pour un motif autre qu&apos;un manquement du Prestataire, les mensualités
            restant à courir jusqu&apos;au terme de cette période demeurent dues et sont
            immédiatement exigibles, à titre de contrepartie de l&apos;engagement souscrit.
          </P>
        </Article>

        <Footer soc={soc} />
      </Page>

      {/* Page 2 */}
      <Page size="A4" style={styles.page}>
        <Article titre="Article 4 — Prix et révision">
          <P>
            L&apos;abonnement est facturé {prix} par mois. Ce prix s&apos;entend net, la taxe sur la
            valeur ajoutée n&apos;étant pas applicable (article 293 B du CGI — régime de la
            franchise en base). Le prix couvre exclusivement la dotation mensuelle définie à
            l&apos;article 2.
          </P>
          <P>
            Le Prestataire se réserve le droit de réviser le prix de l&apos;abonnement une fois par
            an au plus, ainsi qu&apos;en cas de variation significative de ses coûts (énergie,
            fournitures, transport). Toute révision est notifiée au Client au moins trente (30)
            jours avant son entrée en vigueur ; le Client qui n&apos;accepte pas la révision peut
            résilier le contrat dans les conditions de l&apos;article 3, sans que l&apos;engagement
            initial y fasse obstacle si la révision intervient pendant celui-ci.
          </P>
        </Article>

        <Article titre="Article 5 — Facturation, paiement et retard">
          <P>
            L&apos;abonnement est payable mensuellement et d&apos;avance. La facture est émise le{" "}
            {data.jourFacturation} de chaque mois et payable à réception, par virement bancaire,
            carte ou espèces. Le premier paiement est exigible à la prise d&apos;effet du contrat.
          </P>
          <P>
            Conformément à l&apos;article L. 441-10 du Code de commerce, tout retard de paiement
            entraîne de plein droit, sans mise en demeure préalable, l&apos;application de pénalités
            de retard calculées au taux d&apos;intérêt de la Banque centrale européenne majoré de
            dix (10) points de pourcentage, ainsi qu&apos;une indemnité forfaitaire pour frais de
            recouvrement de quarante (40) euros, sans préjudice de tout autre frais de recouvrement
            justifié.
          </P>
          <P>
            En cas de non-paiement d&apos;une échéance, le Prestataire peut, après une mise en
            demeure restée sans effet pendant huit (8) jours, suspendre l&apos;exécution des
            prestations (livraisons et reprises) jusqu&apos;à complet paiement, sans que cette
            suspension ne suspende l&apos;exigibilité des mensualités ni ne constitue une
            résiliation du contrat.
          </P>
        </Article>

        <Article titre="Article 6 — Propriété du linge">
          <P>
            Le linge fourni demeure, en toutes circonstances, la propriété exclusive et
            insaisissable du Prestataire. Il est mis à disposition du Client dans le cadre
            d&apos;une location ; aucun transfert de propriété n&apos;intervient au profit du
            Client, quel que soit le montant des sommes versées. Le Client s&apos;interdit de céder,
            prêter, sous-louer, gager ou aliéner le linge, et de le laver, teindre, marquer ou
            modifier lui-même.
          </P>
        </Article>

        <Article titre="Article 7 — Obligations et responsabilité du Client">
          <P>Le Client s&apos;engage à :</P>
          <Bullet>
            utiliser le linge conformément à sa destination et en bon père de famille, exclusivement
            dans le logement desservi ;
          </Bullet>
          <Bullet>
            restituer au Prestataire, lors de chaque reprise, l&apos;intégralité du linge mis à
            disposition ;
          </Bullet>
          <Bullet>
            permettre l&apos;accès au logement aux créneaux convenus pour la livraison et la reprise
            ;
          </Bullet>
          <Bullet>
            signaler sans délai toute perte, vol ou détérioration, et ne pas procéder lui-même à
            l&apos;entretien du linge.
          </Bullet>
          <P>
            Le Client est responsable du linge dès sa livraison et jusqu&apos;à sa reprise par le
            Prestataire. Tout article perdu, volé, non restitué, ou détérioré au-delà de
            l&apos;usure normale (taches indélébiles, brûlures, déchirures, décoloration) est
            facturé au Client à sa valeur de remplacement à neuf, selon le barème figurant en
            annexe. Le dépôt de garantie éventuel s&apos;impute sur ces sommes sans y être limité.
          </P>
        </Article>

        <Article titre="Article 8 — Livraison, reprise et annulation">
          <P>
            Les livraisons et reprises sont effectuées sur la zone desservie, aux créneaux convenus
            d&apos;un commun accord en fonction des arrivées et départs des voyageurs du Client. Le
            linge est livré propre, plié et emballé ; la reprise du linge sale s&apos;effectue lors
            de la livraison suivante.
          </P>
          <P>
            Toute annulation ou modification d&apos;un créneau par le Client moins de vingt-quatre
            (24) heures avant l&apos;horaire convenu, ou toute impossibilité de livrer ou de
            reprendre imputable au Client (absence, logement inaccessible), pourra donner lieu à la
            facturation de frais de déplacement, et le service concerné est réputé dû.
          </P>
        </Article>

        <Article titre="Article 9 — Obligations et responsabilité du Prestataire">
          <P>
            Le Prestataire est tenu d&apos;une obligation de moyens. Il s&apos;engage à fournir un
            linge propre et entretenu selon les standards de la blanchisserie professionnelle et à
            exécuter les prestations avec soin et diligence.
          </P>
          <P>
            La responsabilité du Prestataire ne peut être engagée qu&apos;en cas de faute prouvée.
            En tout état de cause, sa responsabilité, toutes causes confondues, est limitée au
            montant des sommes effectivement payées par le Client au titre du mois au cours duquel
            le fait générateur est survenu. Le Prestataire n&apos;est en aucun cas responsable des
            dommages indirects ou immatériels (perte d&apos;exploitation, de réservation, de chiffre
            d&apos;affaires, atteinte à la réputation ou aux avis en ligne). Le Prestataire ne
            saurait être tenu responsable d&apos;un retard ou d&apos;une inexécution résultant
            d&apos;un cas de force majeure au sens de l&apos;article 1218 du Code civil (notamment
            intempéries, pannes, grèves, rupture d&apos;approvisionnement, restrictions
            administratives).
          </P>
        </Article>

        <Footer soc={soc} />
      </Page>

      {/* Page 3 */}
      <Page size="A4" style={styles.page}>
        <Article titre="Article 10 — Dépôt de garantie">
          <P>
            {depot
              ? `À la signature du contrat, le Client verse un dépôt de garantie de ${depot}, destiné à couvrir les sommes dues au titre du linge perdu, non restitué ou détérioré (article 7) ainsi que tout impayé. Ce dépôt ne porte pas intérêt et est restitué au Client dans les trente (30) jours suivant la fin du contrat, déduction faite des sommes éventuellement dues. Le versement du dépôt ne limite pas le montant réclamable au Client.`
              : "Le présent contrat ne prévoit pas de dépôt de garantie. Le Prestataire se réserve la faculté d'en demander la constitution en cas de sinistres répétés sur le linge ou d'incidents de paiement."}
          </P>
        </Article>

        <Article titre="Article 11 — Assurance">
          <P>
            Le Client fait son affaire de l&apos;assurance du linge mis à sa disposition pendant la
            durée de sa détention, contre les risques de vol, incendie, dégât des eaux et
            détérioration. Chaque Partie déclare être titulaire d&apos;une assurance de
            responsabilité civile couvrant son activité.
          </P>
        </Article>

        <Article titre="Article 12 — Résiliation pour manquement">
          <P>
            En cas de manquement grave de l&apos;une des Parties à ses obligations (notamment
            non-paiement, non-restitution du linge, dégradations répétées), non réparé dans un délai
            de quinze (15) jours suivant l&apos;envoi d&apos;une mise en demeure par lettre
            recommandée ou courriel avec accusé de réception, l&apos;autre Partie pourra résilier le
            contrat de plein droit, sans préjudice des dommages et intérêts et des sommes restant
            dues. En cas de résiliation aux torts du Client, les mensualités restant à courir
            jusqu&apos;au terme de la période d&apos;engagement deviennent immédiatement exigibles.
          </P>
        </Article>

        <Article titre="Article 13 — Données personnelles">
          <P>
            Les données personnelles du Client sont collectées et traitées par le Prestataire pour
            les seuls besoins de l&apos;exécution du contrat, de la facturation et de la relation
            client, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et
            Libertés. Elles sont conservées pour la durée de la relation contractuelle et les délais
            légaux applicables. Le Client dispose d&apos;un droit d&apos;accès, de rectification,
            d&apos;effacement et d&apos;opposition, qu&apos;il peut exercer à {soc.email}.
          </P>
        </Article>

        <Article titre="Article 14 — Dispositions diverses">
          <P>
            Le présent contrat, avec son annexe, exprime l&apos;intégralité de l&apos;accord des
            Parties et prévaut sur tout échange antérieur. Toute modification fait l&apos;objet
            d&apos;un avenant écrit. La nullité éventuelle d&apos;une clause n&apos;affecte pas la
            validité des autres. Le fait pour une Partie de ne pas se prévaloir d&apos;un manquement
            ne vaut pas renonciation à s&apos;en prévaloir ultérieurement.
          </P>
          {!!data.conditionsParticulieres.trim() && (
            <P>Conditions particulières : {data.conditionsParticulieres}</P>
          )}
        </Article>

        <Article titre="Article 15 — Droit applicable et litiges">
          <P>
            Le présent contrat est régi par le droit français. En cas de différend, les Parties
            s&apos;efforceront de trouver une solution amiable avant toute action contentieuse. À
            défaut d&apos;accord amiable dans un délai de trente (30) jours, et par dérogation
            expresse en application de l&apos;article 48 du Code de procédure civile entre
            professionnels, tout litige relatif à la validité, l&apos;interprétation ou
            l&apos;exécution du présent contrat sera de la compétence exclusive du Tribunal de
            commerce d&apos;Avignon, dans le ressort du siège du Prestataire.
          </P>
        </Article>

        <AnnexeBareme />

        <Footer soc={soc} />
      </Page>

      {/* Page signatures */}
      <Page size="A4" style={styles.page}>
        <Signatures soc={soc} data={data} clientNom={clientNom} />
        <Footer soc={soc} />
      </Page>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Variante PONCTUEL — prestation ponctuelle (sans engagement)
   ══════════════════════════════════════════════════════════════════════════ */

function PonctuelBody({
  data,
  logoSrc,
  soc,
  clientNom,
}: {
  data: ContractData;
  logoSrc?: string;
  soc: ReturnType<typeof resolvePrestataire>;
  clientNom: string;
}) {
  const depot = data.depotGarantieCents > 0 ? euros(data.depotGarantieCents) : null;
  const total = euros(data.totalCents);

  return (
    <>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>{soc.nomCommercial}</Text>
            )}
            <Text style={styles.baseline}>Location &amp; entretien de linge hôtelier</Text>
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.docTitle}>CONTRAT DE PRESTATION</Text>
            <Text style={styles.docSub}>Ponctuelle — location &amp; entretien de linge</Text>
            <Text style={styles.docSub}>
              N° <Text style={styles.metaStrong}>{data.numero || "—"}</Text>
            </Text>
            <Text style={styles.docSub}>Sans engagement · paiement à la commande</Text>
          </View>
        </View>

        <Parties soc={soc} data={data} clientNom={clientNom} />

        <Text style={styles.designation}>
          Ci-après désignés ensemble « les Parties ». Il a été convenu et arrêté ce qui suit. Le
          présent contrat lie un professionnel (le Prestataire) à un client agissant dans le cadre
          de son activité de location de logements meublés de courte durée (le Client).
        </Text>

        {/* Article 1 — Objet */}
        <Article titre="Article 1 — Objet du contrat">
          <P>
            Le présent contrat a pour objet une prestation ponctuelle, sans engagement de durée, de
            location et d&apos;entretien de linge hôtelier au bénéfice du Client, comprenant la mise
            à disposition de linge propre, sa livraison, la reprise du linge sale et son entretien
            en blanchisserie professionnelle, telle que détaillée ci-dessous
            {data.devisNumero ? ` et arrêtée au devis n° ${data.devisNumero}` : ""}.
          </P>
        </Article>

        {/* Article 2 — Prestations et prix */}
        <Article titre="Article 2 — Prestations commandées et prix">
          <P>La présente commande porte sur les prestations suivantes :</P>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colDesignation]}>Désignation</Text>
            <Text style={[styles.th, styles.colQty]}>Qté</Text>
            <Text style={[styles.th, styles.colPu]}>P.U.</Text>
            <Text style={[styles.th, styles.colTotal]}>Total</Text>
          </View>
          {data.lignes.map((l, i) => (
            <View
              key={i}
              style={[styles.tRow, ...(i % 2 === 1 ? [styles.tRowAlt] : [])]}
              wrap={false}
            >
              <Text style={[styles.td, styles.colDesignation]}>{l.designation || "—"}</Text>
              <Text style={[styles.td, styles.colQty]}>{l.qty}</Text>
              <Text style={[styles.td, styles.colPu]}>{euros(l.unitCents)}</Text>
              <Text style={[styles.td, styles.colTotal]}>
                {euros(Math.round(l.qty * l.unitCents))}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{data.tvaApplicable ? "Total TTC" : "Total net"}</Text>
            <Text style={styles.totalValue}>{total}</Text>
          </View>
          <P>
            {data.tvaApplicable
              ? "Les prix sont exprimés toutes taxes comprises."
              : "Prix nets — TVA non applicable, article 293 B du CGI (régime de la franchise en base)."}{" "}
            La prestation est due en intégralité à la commande. Toute prestation supplémentaire fait
            l&apos;objet d&apos;un accord écrit préalable et d&apos;une facturation distincte.
          </P>
        </Article>

        {/* Article 3 — Paiement */}
        <Article titre="Article 3 — Paiement">
          <P>
            Le prix est payable à la commande, à réception de la facture, par virement bancaire,
            carte ou espèces. Conformément à l&apos;article L. 441-10 du Code de commerce, tout
            retard de paiement entraîne de plein droit des pénalités calculées au taux
            d&apos;intérêt de la Banque centrale européenne majoré de dix (10) points de
            pourcentage, ainsi qu&apos;une indemnité forfaitaire de recouvrement de quarante (40)
            euros, sans préjudice de tout autre frais justifié.
          </P>
        </Article>

        {/* Article 4 — Propriété du linge */}
        <Article titre="Article 4 — Propriété du linge">
          <P>
            Le linge fourni demeure, en toutes circonstances, la propriété exclusive et
            insaisissable du Prestataire. Il est mis à disposition du Client dans le cadre
            d&apos;une location ; aucun transfert de propriété n&apos;intervient au profit du
            Client, quel que soit le montant des sommes versées. Le Client s&apos;interdit de céder,
            prêter, sous-louer, gager ou aliéner le linge, et de le laver, teindre, marquer ou
            modifier lui-même.
          </P>
        </Article>

        {/* Article 5 — Obligations et responsabilité du Client */}
        <Article titre="Article 5 — Obligations et responsabilité du Client">
          <P>Le Client s&apos;engage à :</P>
          <Bullet>
            utiliser le linge conformément à sa destination et en bon père de famille, exclusivement
            dans le logement desservi ;
          </Bullet>
          <Bullet>
            restituer au Prestataire, lors de la reprise, l&apos;intégralité du linge mis à
            disposition ;
          </Bullet>
          <Bullet>
            permettre l&apos;accès au logement aux créneaux convenus pour la livraison et la reprise
            ;
          </Bullet>
          <Bullet>
            signaler sans délai toute perte, vol ou détérioration, et ne pas procéder lui-même à
            l&apos;entretien du linge.
          </Bullet>
          <P>
            Le Client est responsable du linge dès sa livraison et jusqu&apos;à sa reprise par le
            Prestataire. Tout article perdu, volé, non restitué, ou détérioré au-delà de
            l&apos;usure normale (taches indélébiles, brûlures, déchirures, décoloration) est
            facturé au Client à sa valeur de remplacement à neuf, selon le barème figurant en
            annexe. Le dépôt de garantie éventuel s&apos;impute sur ces sommes sans y être limité.
          </P>
        </Article>

        <Footer soc={soc} />
      </Page>

      {/* Page 2 */}
      <Page size="A4" style={styles.page}>
        {/* Article 6 — Livraison, reprise et annulation */}
        <Article titre="Article 6 — Livraison, reprise et annulation">
          <P>
            La livraison et la reprise sont effectuées sur la zone desservie, aux créneaux convenus
            d&apos;un commun accord. Le linge est livré propre, plié et emballé ; la reprise du
            linge sale s&apos;effectue au créneau convenu.
          </P>
          <P>
            Toute annulation ou modification d&apos;un créneau par le Client moins de vingt-quatre
            (24) heures avant l&apos;horaire convenu, ou toute impossibilité de livrer ou de
            reprendre imputable au Client (absence, logement inaccessible), pourra donner lieu à la
            facturation de frais de déplacement, et le service concerné est réputé dû. En cas
            d&apos;annulation de la commande par le Client moins de quarante-huit (48) heures avant
            la livraison prévue, la prestation demeure due dans son intégralité.
          </P>
        </Article>

        {/* Article 7 — Obligations et responsabilité du Prestataire */}
        <Article titre="Article 7 — Obligations et responsabilité du Prestataire">
          <P>
            Le Prestataire est tenu d&apos;une obligation de moyens. Il s&apos;engage à fournir un
            linge propre et entretenu selon les standards de la blanchisserie professionnelle et à
            exécuter la prestation avec soin et diligence.
          </P>
          <P>
            La responsabilité du Prestataire ne peut être engagée qu&apos;en cas de faute prouvée.
            En tout état de cause, sa responsabilité, toutes causes confondues, est limitée au
            montant des sommes effectivement payées par le Client au titre de la présente commande.
            Le Prestataire n&apos;est en aucun cas responsable des dommages indirects ou immatériels
            (perte d&apos;exploitation, de réservation, de chiffre d&apos;affaires, atteinte à la
            réputation ou aux avis en ligne). Le Prestataire ne saurait être tenu responsable
            d&apos;un retard ou d&apos;une inexécution résultant d&apos;un cas de force majeure au
            sens de l&apos;article 1218 du Code civil (notamment intempéries, pannes, grèves,
            rupture d&apos;approvisionnement, restrictions administratives).
          </P>
        </Article>

        {/* Article 8 — Dépôt de garantie */}
        <Article titre="Article 8 — Dépôt de garantie">
          <P>
            {depot
              ? `Le Client verse un dépôt de garantie de ${depot}, destiné à couvrir les sommes dues au titre du linge perdu, non restitué ou détérioré (article 5) ainsi que tout impayé. Ce dépôt ne porte pas intérêt et est restitué au Client dans les trente (30) jours suivant la reprise du linge, déduction faite des sommes éventuellement dues. Le versement du dépôt ne limite pas le montant réclamable au Client.`
              : "La présente commande ne prévoit pas de dépôt de garantie. Le Prestataire se réserve la faculté d'en demander la constitution en cas de sinistres sur le linge ou d'incidents de paiement."}
          </P>
        </Article>

        {/* Article 9 — Assurance */}
        <Article titre="Article 9 — Assurance">
          <P>
            Le Client fait son affaire de l&apos;assurance du linge mis à sa disposition pendant la
            durée de sa détention, contre les risques de vol, incendie, dégât des eaux et
            détérioration. Chaque Partie déclare être titulaire d&apos;une assurance de
            responsabilité civile couvrant son activité.
          </P>
        </Article>

        {/* Article 10 — Résiliation pour manquement */}
        <Article titre="Article 10 — Résiliation pour manquement">
          <P>
            En cas de manquement grave de l&apos;une des Parties à ses obligations (notamment
            non-paiement, non-restitution du linge, dégradations), non réparé dans un délai de huit
            (8) jours suivant l&apos;envoi d&apos;une mise en demeure par courrier ou courriel avec
            accusé de réception, l&apos;autre Partie pourra résilier la prestation de plein droit,
            sans préjudice des dommages et intérêts et des sommes restant dues.
          </P>
        </Article>

        {/* Article 11 — Données personnelles */}
        <Article titre="Article 11 — Données personnelles">
          <P>
            Les données personnelles du Client sont collectées et traitées par le Prestataire pour
            les seuls besoins de l&apos;exécution de la prestation, de la facturation et de la
            relation client, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique
            et Libertés. Elles sont conservées pour la durée nécessaire et les délais légaux
            applicables. Le Client dispose d&apos;un droit d&apos;accès, de rectification,
            d&apos;effacement et d&apos;opposition, qu&apos;il peut exercer à {soc.email}.
          </P>
        </Article>

        {/* Article 12 — Dispositions diverses */}
        <Article titre="Article 12 — Dispositions diverses">
          <P>
            Le présent contrat, avec son annexe, exprime l&apos;intégralité de l&apos;accord des
            Parties pour la prestation concernée et prévaut sur tout échange antérieur. Toute
            modification fait l&apos;objet d&apos;un accord écrit. La nullité éventuelle d&apos;une
            clause n&apos;affecte pas la validité des autres. Le fait pour une Partie de ne pas se
            prévaloir d&apos;un manquement ne vaut pas renonciation à s&apos;en prévaloir
            ultérieurement.
          </P>
          {!!data.conditionsParticulieres.trim() && (
            <P>Conditions particulières : {data.conditionsParticulieres}</P>
          )}
        </Article>

        {/* Article 13 — Droit applicable */}
        <Article titre="Article 13 — Droit applicable et litiges">
          <P>
            Le présent contrat est régi par le droit français. En cas de différend, les Parties
            s&apos;efforceront de trouver une solution amiable avant toute action contentieuse. À
            défaut d&apos;accord amiable dans un délai de trente (30) jours, et par dérogation
            expresse en application de l&apos;article 48 du Code de procédure civile entre
            professionnels, tout litige relatif à la validité, l&apos;interprétation ou
            l&apos;exécution du présent contrat sera de la compétence exclusive du Tribunal de
            commerce d&apos;Avignon, dans le ressort du siège du Prestataire.
          </P>
        </Article>

        <AnnexeBareme />

        <Signatures soc={soc} data={data} clientNom={clientNom} />

        <Footer soc={soc} />
      </Page>
    </>
  );
}

/* ─── Document ─── */

export function ContractDocument({
  data,
  logoSrc,
  operator,
}: {
  data: ContractData;
  logoSrc?: string;
  operator?: OperatorInfo;
}) {
  const soc = resolvePrestataire(operator);
  const clientNom = data.client.etablissement || data.client.nom || "le Client";
  const isPonctuel = data.type === "PONCTUEL";
  const titre = isPonctuel
    ? `Contrat de prestation ponctuelle ${data.numero}`
    : `Contrat Pack Sérénité ${data.numero}`;
  const sujet = isPonctuel
    ? `Contrat de prestation ponctuelle — ${clientNom}`
    : `Contrat d'abonnement Pack Sérénité — ${clientNom}`;

  return (
    <Document title={titre} author={soc.nomCommercial} subject={sujet}>
      {isPonctuel ? (
        <PonctuelBody data={data} logoSrc={logoSrc} soc={soc} clientNom={clientNom} />
      ) : (
        <AbonnementBody data={data} logoSrc={logoSrc} soc={soc} clientNom={clientNom} />
      )}
    </Document>
  );
}

/* ─── Download ─── */

export async function downloadContractPdf(
  data: ContractData,
  options?: { operator?: OperatorInfo; logoUrl?: string },
) {
  let logoSrc: string | undefined;
  const logoUrl = options?.logoUrl ?? "/images/logo_full.png";
  try {
    const res = await fetch(logoUrl);
    if (res.ok) {
      const blob = await res.blob();
      logoSrc = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    logoSrc = undefined;
  }

  const blob = await pdf(
    <ContractDocument data={data} logoSrc={logoSrc} operator={options?.operator} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const prefix = data.type === "PONCTUEL" ? "contrat-prestation" : "contrat-pack-serenite";
  const safe = (data.numero || "linge-serein").replace(/[^a-zA-Z0-9-_]/g, "-");
  a.download = `${prefix}-${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
