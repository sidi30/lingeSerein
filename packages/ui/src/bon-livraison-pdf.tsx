/**
 * Rendu PDF du bon de livraison & décharge Linge Serein.
 * Importer via import dynamique (lazy) pour ne pas charger @react-pdf/renderer
 * dans le bundle SSR :
 *   const { downloadBonLivraisonPdf } = await import("@lingengo/ui/bon-livraison-pdf");
 *
 * NON utilisable côté serveur (Node/Fastify) — contient du JSX React.
 *
 * Document de RÉCEPTION : il constate les quantités remises et fait courir la
 * garde du linge. Il ne porte volontairement aucun prix (voir BonLivraisonLine).
 */

import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import type { BonLivraisonData, DeliveryZone } from "@lingengo/shared";
import {
  BLANK_PLACEHOLDER,
  DELIVERY_ZONE_LABELS,
  SUBSCRIPTION_DEFAULTS,
  countArticlesLivres,
  printableField,
  urgencyTier,
} from "@lingengo/shared";
import { LOGO_DATA_URI } from "./logo";
import { resolvePrestataire } from "./operator";
import type { OperatorInfo } from "./operator";

/* ─── Opérateur / identité légale — source unique dans ./operator ─── */

export type { OperatorInfo } from "./operator";

/* ─── Branding ─── */

const FOREST = "#1b5e20";
const LAVENDER = "#5e5488";
const INK = "#1f2937";
const GRAY = "#6b7280";
const LINE = "#e5e0f0";
const CREAM = "#faf8f3";

/* ─── Styles ─── */

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 36,
    paddingBottom: 42,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },
  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 11,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: FOREST,
  },
  logo: { width: 116, height: 41, objectFit: "contain" },
  logoFallback: { fontFamily: "Times-Bold", fontSize: 20, color: FOREST },
  baseline: { fontSize: 8, color: GRAY, marginTop: 2 },
  titleWrap: { alignItems: "flex-end", maxWidth: 250 },
  docTitle: {
    fontFamily: "Times-Bold",
    fontSize: 17,
    color: FOREST,
    textAlign: "right",
    letterSpacing: 0.5,
  },
  docSub: { fontSize: 8.5, color: LAVENDER, marginTop: 3, textAlign: "right" },
  docMeta: { fontSize: 8.5, color: GRAY, marginTop: 4, textAlign: "right" },
  docMetaStrong: { color: INK, fontFamily: "Helvetica-Bold" },
  /* Parties */
  parties: { flexDirection: "row", gap: 14, marginBottom: 9 },
  partyBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    padding: 9,
    backgroundColor: CREAM,
  },
  partyLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: INK, marginBottom: 2 },
  partyLine: { fontSize: 8.5, color: GRAY, marginBottom: 1.5 },
  /* Bandeau livraison (zone / urgence) */
  infoBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 9,
  },
  infoItem: { flexDirection: "row" },
  infoLabel: { fontSize: 8, color: GRAY },
  infoValue: { fontSize: 8, color: INK, fontFamily: "Helvetica-Bold" },
  /* Section */
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: FOREST,
    marginTop: 10,
    marginBottom: 5,
    paddingBottom: 2.5,
    borderBottomWidth: 1,
    borderBottomColor: FOREST,
  },
  /* Table */
  tableHead: {
    flexDirection: "row",
    backgroundColor: FOREST,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#ffffff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4.5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowAlt: { backgroundColor: CREAM },
  td: { fontSize: 9, color: INK },
  colDesignation: { flex: 1, paddingRight: 8 },
  colQty: { width: 70, textAlign: "center" },
  colReprise: { width: 80, alignItems: "center", textAlign: "center" },
  /* Case à remplir au stylo dans la colonne « Qté reprise » */
  penBox: {
    width: 46,
    height: 14,
    borderWidth: 0.75,
    borderColor: GRAY,
    borderRadius: 2,
    backgroundColor: "#ffffff",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: FOREST,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 5,
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#ffffff" },
  totalValue: { fontFamily: "Times-Bold", fontSize: 11, color: "#ffffff" },
  /* État à la réception */
  etatBox: {
    borderWidth: 1,
    borderColor: FOREST,
    borderRadius: 6,
    backgroundColor: "#f0f6f0",
    padding: 9,
  },
  checkLine: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  checkBox: {
    width: 11,
    height: 11,
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 2,
    backgroundColor: "#ffffff",
    marginRight: 7,
    marginTop: 0.5,
  },
  checkText: { flex: 1, fontSize: 9, color: INK },
  reserveLine: {
    borderBottomWidth: 0.75,
    borderBottomColor: GRAY,
    borderBottomStyle: "dashed",
    height: 13,
    marginTop: 5,
  },
  /* Notes */
  notesBox: { marginTop: 8, borderLeftWidth: 3, borderLeftColor: LAVENDER, paddingLeft: 10 },
  notesLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  notesText: { fontSize: 8.5, color: GRAY, lineHeight: 1.5 },
  /* Décharge */
  dechargeWrap: { marginTop: 10 },
  dechargeText: {
    fontSize: 7.2,
    color: INK,
    lineHeight: 1.35,
    textAlign: "justify",
    marginBottom: 3,
  },
  dechargeLead: {
    fontFamily: "Helvetica-Bold",
    color: FOREST,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  /* Signatures */
  signWrap: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, gap: 18 },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    padding: 9,
    minHeight: 82,
  },
  signLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  signField: { fontSize: 8, color: GRAY, marginBottom: 2.5 },
  signLine: { marginTop: 5, height: 30, borderBottomWidth: 1, borderBottomColor: LINE },
  signMention: { fontSize: 7, color: INK, marginTop: 4, fontFamily: "Helvetica-Oblique" },
  /* Mentions légales + footer */
  legalBox: { marginTop: 8, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  legalText: { fontSize: 6.5, color: GRAY, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
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

/* ─── Blocs ─── */

function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.checkLine}>
      <View style={styles.checkBox} />
      <Text style={styles.checkText}>{children}</Text>
    </View>
  );
}

/**
 * Libellé court de zone, dérivé de DELIVERY_ZONE_LABELS : on coupe la liste des
 * communes et la mention « sur devis » qui déborderaient du bandeau.
 * « Villes limitrophes d'Orange (Jonquières, …) » → « Villes limitrophes d'Orange ».
 */
function shortZoneLabel(zone: DeliveryZone): string {
  return (DELIVERY_ZONE_LABELS[zone].split("(")[0] ?? "").split("—")[0]?.trim() || zone;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label} </Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/* ─── Document ─── */

export function BonLivraisonDocument({
  data,
  logoSrc,
  operator,
}: {
  data: BonLivraisonData;
  logoSrc?: string;
  operator?: OperatorInfo;
}) {
  const soc = resolvePrestataire(operator);
  const blank = !!data.blankFields;
  const clientNom = data.client.etablissement || data.client.nom || "le Client";
  const urgency = data.urgency ? urgencyTier(data.urgency) : null;
  const totalArticles = countArticlesLivres(data.lines);
  const detentionJours = SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS;
  // Lignes vierges à compléter au stylo (articles ajoutés sur place).
  const blankRows = Array.from({ length: blank ? (data.blankLines ?? 4) : 0 });

  return (
    <Document
      title={`Bon de livraison ${data.numero}`}
      author={soc.nomCommercial}
      subject={`Bon de livraison & décharge — ${clientNom}`}
    >
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
            <Text style={styles.baseline}>{soc.baseline}</Text>
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.docTitle}>BON DE LIVRAISON</Text>
            <Text style={styles.docSub}>&amp; décharge de responsabilité</Text>
            <Text style={styles.docMeta}>
              {"N° "}
              <Text style={styles.docMetaStrong}>{printableField(data.numero, blank)}</Text>
            </Text>
            <Text style={styles.docMeta}>
              {"Livré le "}
              <Text style={styles.docMetaStrong}>{printableField(data.date, blank)}</Text>
              {"  à  "}
              <Text style={styles.docMetaStrong}>{printableField(data.heure, blank)}</Text>
            </Text>
            {!!data.devisNumero && <Text style={styles.docMeta}>Devis n° {data.devisNumero}</Text>}
          </View>
        </View>

        {/* Prestataire / Client */}
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Le Prestataire</Text>
            <Text style={styles.partyName}>
              {soc.nomCommercial} — {soc.raisonSociale}
            </Text>
            <Text style={styles.partyLine}>SIREN {soc.siren}</Text>
            <Text style={styles.partyLine}>{soc.adresse}</Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Livré à</Text>
            <Text style={styles.partyName}>
              {printableField(data.client.etablissement || data.client.nom, blank)}
            </Text>
            {(!!data.client.nom || blank) && !!data.client.etablissement && (
              <Text style={styles.partyLine}>{printableField(data.client.nom, blank)}</Text>
            )}
            <Text style={styles.partyLine}>
              {"Adresse de livraison : "}
              {printableField(data.adresseLivraison || data.client.adresse, blank)}
            </Text>
            {(!!data.client.tel || blank) && (
              <Text style={styles.partyLine}>
                {"Tél. "}
                {printableField(data.client.tel, blank)}
              </Text>
            )}
          </View>
        </View>

        {/* Zone / niveau de service / livreur */}
        <View style={styles.infoBar}>
          <InfoItem
            label="Zone :"
            value={data.zone ? shortZoneLabel(data.zone) : printableField(undefined, blank)}
          />
          {!!urgency && (
            <InfoItem
              label="Niveau de service :"
              value={`${urgency.label} — ${urgency.delaiText}`}
            />
          )}
          <InfoItem label="Livreur :" value={printableField(data.livreurNom, blank)} />
        </View>

        {/* Articles remis */}
        <Text style={styles.sectionTitle}>Articles remis</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colDesignation]}>Désignation</Text>
          <Text style={[styles.th, styles.colQty]}>Qté livrée</Text>
          <Text style={[styles.th, styles.colReprise]}>Qté reprise</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]} wrap={false}>
            <Text style={[styles.td, styles.colDesignation]}>{l.designation || "—"}</Text>
            <Text style={[styles.td, styles.colQty]}>{l.qty}</Text>
            <View style={styles.colReprise}>
              <View style={styles.penBox} />
            </View>
          </View>
        ))}
        {blankRows.map((_, i) => (
          <View
            key={`blank-${i}`}
            style={[styles.row, ...((data.lines.length + i) % 2 === 1 ? [styles.rowAlt] : [])]}
            wrap={false}
          >
            <Text style={[styles.td, styles.colDesignation]}>{BLANK_PLACEHOLDER}</Text>
            <Text style={[styles.td, styles.colQty]}>______</Text>
            <View style={styles.colReprise}>
              <View style={styles.penBox} />
            </View>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total articles livrés</Text>
          <Text style={styles.totalValue}>{totalArticles}</Text>
        </View>

        {/* État à la réception */}
        <Text style={styles.sectionTitle}>État à la réception</Text>
        <View style={styles.etatBox} wrap={false}>
          <CheckLine>Linge reçu conforme et complet, en bon état de propreté.</CheckLine>
          <CheckLine>Réserves émises à la remise (à détailler ci-dessous) :</CheckLine>
          <View style={styles.reserveLine} />
          <View style={styles.reserveLine} />
        </View>

        {/* Observations */}
        {!!(data.notes ?? "").trim() && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Observations</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* Décharge — pas de wrap={false} : le bloc doit pouvoir s'écouler en bas
            de page plutôt que sauter entier à la page suivante en laissant un vide. */}
        <View style={styles.dechargeWrap}>
          <Text style={styles.dechargeText}>
            <Text style={styles.dechargeLead}>Décharge — </Text>
            Le Client, ou toute personne présente agissant pour son compte, reconnaît avoir reçu ce
            jour les articles listés ci-dessus, dans les quantités indiquées et en bon état de
            propreté.
          </Text>
          <Text style={styles.dechargeText}>
            Toute réserve doit être portée sur le présent bon au moment de la remise. À défaut de
            réserve écrite, le linge est réputé livré complet, propre et exempt de défaut apparent ;
            aucune contestation portant sur les quantités remises ou sur l&apos;état apparent du
            linge ne pourra être formée ultérieurement.
          </Text>
          <Text style={styles.dechargeText}>
            Le linge demeure la propriété exclusive du Prestataire. Le Client en assume la garde
            depuis la présente remise et jusqu&apos;à sa reprise effective : tout article perdu,
            volé, non restitué ou détérioré au-delà de l&apos;usure normale lui est facturé à sa
            valeur de remplacement à neuf, selon le barème annexé au contrat. Il s&apos;interdit de
            laver, teindre, marquer ou modifier le linge, et de le confier à un tiers.
          </Text>
          <Text style={styles.dechargeText}>
            En formule d&apos;abonnement, le linge est repris au passage suivant et ne peut être
            conservé plus de {detentionJours} jours ; au-delà, lorsque la reprise n&apos;a pu être
            effectuée du fait du Client, les kits concernés sont facturés au tarif à l&apos;unité en
            vigueur. La signature du présent bon vaut réception des articles listés ; elle ne vaut
            ni réception de facture, ni renonciation aux droits du Client au titre des défauts non
            apparents à la remise.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signWrap} wrap={false}>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>Le Client — réception</Text>
            <Text style={styles.signField}>
              {"Nom : "}
              {printableField(data.client.nom || data.client.etablissement, blank)}
            </Text>
            <Text style={styles.signField}>
              {"Date : "}
              {printableField(data.date, blank)}
            </Text>
            <View style={styles.signLine} />
            <Text style={styles.signMention}>
              Signature précédée de la mention « Reçu conforme »
            </Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>Le Livreur — remise</Text>
            <Text style={styles.signField}>
              {"Nom : "}
              {printableField(data.livreurNom, blank)}
            </Text>
            <Text style={styles.signField}>
              {"Date : "}
              {printableField(data.date, blank)}
            </Text>
            <View style={styles.signLine} />
            <Text style={styles.signMention}>Pour {soc.nomCommercial}</Text>
          </View>
        </View>

        {/* Mentions légales */}
        <View style={styles.legalBox}>
          <Text style={styles.legalText}>
            {soc.nomCommercial} — {soc.raisonSociale} (EI), SIRET {soc.siret}. Établi en deux
            exemplaires, dont un remis au Client ; ne constitue pas une facture.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            <Text style={styles.footerStrong}>{soc.nomCommercial}</Text>
            {" · "}
            {soc.tel}
            {" · "}
            {soc.email}
          </Text>
          <Text
            style={styles.pageNum}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/* ─── Download ─── */

export async function downloadBonLivraisonPdf(
  data: BonLivraisonData,
  options?: { operator?: OperatorInfo; logoUrl?: string },
) {
  // Logo embarqué (data-URI) TOUJOURS disponible → jamais de fallback texte.
  // `options.logoUrl` reste un override optionnel : si le fetch réussit on l'utilise,
  // sinon on conserve le logo embarqué.
  let logoSrc: string = LOGO_DATA_URI;
  if (options?.logoUrl) {
    try {
      const res = await fetch(options.logoUrl);
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
      // conserve le LOGO_DATA_URI embarqué
    }
  }

  const blob = await pdf(
    <BonLivraisonDocument data={data} logoSrc={logoSrc} operator={options?.operator} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (data.numero || "linge-serein").replace(/[^a-zA-Z0-9-_]/g, "-");
  a.download = `bon-livraison-${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
