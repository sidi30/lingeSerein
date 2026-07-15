import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";

/* ══════════════════════════════════════════════════════════════════════════
   Contrat d'abonnement Pack Sérénité — Linge Serein (Serein Act)
   Contrat B2B de location & entretien de linge, rédigé pour protéger le
   prestataire. Généré côté client (@react-pdf) — aucune donnée n'est envoyée.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── Types ─── */

export interface ContractData {
  /** N° de contrat, ex. CTR-202607-001 */
  numero: string;
  /** Date de signature, format libre (ex. 16 juillet 2026) */
  date: string;
  /** Lieu de signature */
  lieu: string;
  client: {
    /** Nom du représentant / signataire (obligatoire) */
    nom: string;
    /** Dénomination de l'établissement (gîte, hôtel, EI…) */
    etablissement: string;
    /** Forme juridique / SIRET du client si professionnel (optionnel) */
    identifiant: string;
    /** Adresse du logement desservi / adresse de facturation */
    adresse: string;
    email: string;
    tel: string;
  };
  /** Prix mensuel en centimes (défaut 8900 = 89 €) */
  prixMensuelCents: number;
  /** Dotation mensuelle incluse */
  kitsBain: number;
  kitsLit: number;
  /** Nombre de livraisons & reprises incluses par mois */
  livraisonsIncluses: number;
  /** Date de prise d'effet de l'abonnement */
  dateDebut: string;
  /** Durée d'engagement initiale (mois) */
  engagementMois: number;
  /** Préavis de résiliation (jours) après période initiale */
  preavisJours: number;
  /** Jour de facturation mensuelle (ex. 1er) */
  jourFacturation: string;
  /** Dépôt de garantie en centimes (0 = aucun) */
  depotGarantieCents: number;
  /** Conditions particulières libres (optionnel) */
  conditionsParticulieres: string;
  /** Signature du prestataire (data URL PNG) */
  signatureSrc?: string;
}

/* ─── Prestataire (identité légale — source de vérité) ─── */

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
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
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
  designationStrong: { fontFamily: "Helvetica-Bold", color: FOREST },
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
  /* Table barème */
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

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        <Text style={styles.footerStrong}>{PRESTATAIRE.nomCommercial}</Text> ·{" "}
        {PRESTATAIRE.raisonSociale} · SIRET {PRESTATAIRE.siret}
      </Text>
      <Text
        style={styles.pageNum}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

/* ─── Document ─── */

export function ContractDocument({ data, logoSrc }: { data: ContractData; logoSrc?: string }) {
  const prix = euros(data.prixMensuelCents);
  const clientNom = data.client.etablissement || data.client.nom || "le Client";
  const depot = data.depotGarantieCents > 0 ? euros(data.depotGarantieCents) : null;

  return (
    <Document
      title={`Contrat Pack Sérénité ${data.numero}`}
      author={PRESTATAIRE.nomCommercial}
      subject={`Contrat d'abonnement Pack Sérénité — ${clientNom}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>{PRESTATAIRE.nomCommercial}</Text>
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

        {/* Entre les parties */}
        <Text style={styles.partiesIntro}>Entre les soussignés :</Text>
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Le Prestataire</Text>
            <Text style={styles.partyName}>
              {PRESTATAIRE.nomCommercial} — {PRESTATAIRE.raisonSociale}
            </Text>
            <Text style={styles.partyLine}>{PRESTATAIRE.forme}</Text>
            <Text style={styles.partyLine}>Représentée par {PRESTATAIRE.representant}</Text>
            <Text style={styles.partyLine}>SIRET {PRESTATAIRE.siret}</Text>
            <Text style={styles.partyLine}>{PRESTATAIRE.adresse}</Text>
            <Text style={styles.partyLine}>
              {PRESTATAIRE.tel} · {PRESTATAIRE.email}
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

        <Footer />
      </Page>

      {/* Page 2 */}
      <Page size="A4" style={styles.page}>
        {/* Article 4 — Prix */}
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

        {/* Article 5 — Facturation et paiement */}
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

        {/* Article 6 — Propriété et mise à disposition du linge */}
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

        {/* Article 7 — Obligations du Client */}
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

        {/* Article 8 — Livraison et reprise */}
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

        {/* Article 9 — Obligations et responsabilité du Prestataire */}
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

        <Footer />
      </Page>

      {/* Page 3 */}
      <Page size="A4" style={styles.page}>
        {/* Article 10 — Dépôt de garantie */}
        <Article titre="Article 10 — Dépôt de garantie">
          <P>
            {depot
              ? `À la signature du contrat, le Client verse un dépôt de garantie de ${depot}, destiné à couvrir les sommes dues au titre du linge perdu, non restitué ou détérioré (article 7) ainsi que tout impayé. Ce dépôt ne porte pas intérêt et est restitué au Client dans les trente (30) jours suivant la fin du contrat, déduction faite des sommes éventuellement dues. Le versement du dépôt ne limite pas le montant réclamable au Client.`
              : "Le présent contrat ne prévoit pas de dépôt de garantie. Le Prestataire se réserve la faculté d'en demander la constitution en cas de sinistres répétés sur le linge ou d'incidents de paiement."}
          </P>
        </Article>

        {/* Article 11 — Assurance */}
        <Article titre="Article 11 — Assurance">
          <P>
            Le Client fait son affaire de l&apos;assurance du linge mis à sa disposition pendant la
            durée de sa détention, contre les risques de vol, incendie, dégât des eaux et
            détérioration. Chaque Partie déclare être titulaire d&apos;une assurance de
            responsabilité civile couvrant son activité.
          </P>
        </Article>

        {/* Article 12 — Résiliation pour manquement */}
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

        {/* Article 13 — Données personnelles */}
        <Article titre="Article 13 — Données personnelles">
          <P>
            Les données personnelles du Client sont collectées et traitées par le Prestataire pour
            les seuls besoins de l&apos;exécution du contrat, de la facturation et de la relation
            client, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et
            Libertés. Elles sont conservées pour la durée de la relation contractuelle et les délais
            légaux applicables. Le Client dispose d&apos;un droit d&apos;accès, de rectification,
            d&apos;effacement et d&apos;opposition, qu&apos;il peut exercer à {PRESTATAIRE.email}.
          </P>
        </Article>

        {/* Article 14 — Divers */}
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

        {/* Article 15 — Droit applicable */}
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

        {/* Annexe — Barème */}
        <Article titre="Annexe — Barème de remplacement du linge (valeur à neuf)">
          <P>
            Valeurs indicatives appliquées en cas de perte, vol, non-restitution ou détérioration
            irréversible d&apos;un article (article 7) :
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

        <Footer />
      </Page>

      {/* Page signatures */}
      <Page size="A4" style={styles.page}>
        <Article titre="Signatures">
          <P>
            Fait à {data.lieu || "Orange"}, le {data.date || "…"}, en deux exemplaires originaux,
            dont un remis à chaque Partie. Chaque Partie reconnaît avoir pris connaissance de
            l&apos;ensemble des clauses du présent contrat et de son annexe, et les accepter sans
            réserve.
          </P>
        </Article>

        <View style={styles.signWrap} wrap={false}>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>Le Prestataire</Text>
            <Text style={styles.signName}>
              {PRESTATAIRE.nomCommercial} — {PRESTATAIRE.raisonSociale}
            </Text>
            <Text style={styles.signSub}>{PRESTATAIRE.representant}</Text>
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

        {/* Mentions légales */}
        <View style={styles.legalBox}>
          <Text style={styles.legalText}>
            {PRESTATAIRE.nomCommercial} est le nom commercial de l&apos;entreprise individuelle{" "}
            {PRESTATAIRE.raisonSociale} — {PRESTATAIRE.representant}. SIREN {PRESTATAIRE.siren} ·
            SIRET du siège {PRESTATAIRE.siret} · Code APE {PRESTATAIRE.ape} · Code APRM{" "}
            {PRESTATAIRE.aprm}. Siège : {PRESTATAIRE.adresse}. Entreprise immatriculée au Registre
            National des Entreprises le {PRESTATAIRE.rne}. TVA non applicable, art. 293 B du CGI.
          </Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );
}

/* ─── Download ─── */

export async function downloadContractPdf(data: ContractData) {
  let logoSrc: string | undefined;
  try {
    const res = await fetch("/images/logo_full.png");
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

  const blob = await pdf(<ContractDocument data={data} logoSrc={logoSrc} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (data.numero || "linge-serein").replace(/[^a-zA-Z0-9-_]/g, "-");
  a.download = `contrat-pack-serenite-${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
