/**
 * Rendu PDF des devis Linge Serein.
 * Importer via import dynamique (lazy) pour ne pas charger @react-pdf/renderer dans le bundle SSR :
 *   const { downloadDevisPdf } = await import("@lingengo/ui/devis-pdf");
 *
 * NON utilisable côté serveur (Node/Fastify) — contient du JSX React.
 */

import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import { computeDevisTotals } from "@lingengo/shared";
import type { DevisData } from "@lingengo/shared";

/* ─── Branding ─── */

const FOREST = "#1b5e20";
const LAVENDER = "#5e5488";
const INK = "#1f2937";
const GRAY = "#6b7280";
const LINE = "#e5e0f0";
const CREAM = "#faf8f3";

const SOCIETE_DEFAULT = {
  nom: "Linge Serein",
  baseline: "Votre linge, notre sérénité",
  adresse: "Rue Simone Weil, 84100 Orange, Vaucluse",
  tel: "07 53 56 95 48",
  email: "lingeserein@gmail.com",
};

export interface OperatorInfo {
  nom?: string;
  adresse?: string;
  tel?: string;
  email?: string;
  siret?: string | null;
  legalMentions?: string | null;
}

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
    paddingTop: 36,
    paddingHorizontal: 40,
    paddingBottom: 64,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  logo: { width: 130, height: 46, objectFit: "contain" },
  logoFallback: { fontFamily: "Times-Bold", fontSize: 20, color: FOREST },
  baseline: { fontSize: 8, color: GRAY, marginTop: 2 },
  devisTitleWrap: { alignItems: "flex-end" },
  devisTitle: { fontFamily: "Times-Bold", fontSize: 26, color: FOREST, letterSpacing: 1 },
  devisMeta: { fontSize: 9, color: GRAY, marginTop: 4, textAlign: "right" },
  devisMetaStrong: { color: INK, fontFamily: "Helvetica-Bold" },
  parties: { flexDirection: "row", gap: 16, marginBottom: 22 },
  partyBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    padding: 12,
    backgroundColor: CREAM,
  },
  partyLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 11, color: INK, marginBottom: 2 },
  partyLine: { fontSize: 9, color: GRAY, marginBottom: 1.5 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: FOREST,
    color: "#ffffff",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#ffffff" },
  row: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowAlt: { backgroundColor: CREAM },
  td: { fontSize: 9, color: INK },
  colDesignation: { flex: 1, paddingRight: 8 },
  colQty: { width: 50, textAlign: "right" },
  colPu: { width: 80, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totalsBox: { width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 9, color: GRAY },
  totalValue: { fontSize: 9, color: INK, textAlign: "right" },
  totalDivider: { height: 1, backgroundColor: LINE, marginVertical: 5 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: FOREST,
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  grandLabel: { fontFamily: "Times-Bold", fontSize: 11, color: "#ffffff" },
  grandValue: { fontFamily: "Times-Bold", fontSize: 13, color: "#ffffff" },
  notesBox: { marginTop: 22, borderLeftWidth: 3, borderLeftColor: LAVENDER, paddingLeft: 10 },
  notesLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  notesText: { fontSize: 9, color: GRAY, lineHeight: 1.5 },
  conditions: { marginTop: 18, fontSize: 8, color: GRAY, lineHeight: 1.5 },
  signWrap: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 24 },
  signBox: { flex: 1 },
  signLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  signName: { fontSize: 9, color: INK, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  signImg: { width: 150, height: 60, objectFit: "contain" },
  signLineBox: {
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    justifyContent: "flex-end",
  },
  signHint: { fontSize: 7, color: GRAY, marginTop: 3 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: GRAY },
  footerStrong: { color: FOREST, fontFamily: "Helvetica-Bold" },
  watermarkWrap: {
    position: "absolute",
    top: "35%",
    left: "15%",
    right: "15%",
    opacity: 0.08,
    transform: "rotate(-30deg)",
  },
  watermarkText: {
    fontFamily: "Times-Bold",
    fontSize: 72,
    color: GRAY,
    textAlign: "center",
    letterSpacing: 8,
  },
});

/* ─── Document ─── */

export function DevisDocument({
  data,
  logoSrc,
  operator,
}: {
  data: DevisData;
  logoSrc?: string;
  operator?: OperatorInfo;
}) {
  const t = computeDevisTotals(data);
  const soc = {
    nom: operator?.nom ?? SOCIETE_DEFAULT.nom,
    baseline: SOCIETE_DEFAULT.baseline,
    adresse: operator?.adresse ?? SOCIETE_DEFAULT.adresse,
    tel: operator?.tel ?? SOCIETE_DEFAULT.tel,
    email: operator?.email ?? SOCIETE_DEFAULT.email,
  };

  const isBrouillon = data.numero?.includes("BROUILLON") || data.numero === "";

  return (
    <Document
      title={`Devis ${data.numero}`}
      author={soc.nom}
      subject={`Devis pour ${data.client.nom || data.client.etablissement || "client"}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Filigrane BROUILLON */}
        {isBrouillon && (
          <View style={styles.watermarkWrap} fixed>
            <Text style={styles.watermarkText}>BROUILLON</Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>{soc.nom}</Text>
            )}
            <Text style={styles.baseline}>{soc.baseline}</Text>
          </View>
          <View style={styles.devisTitleWrap}>
            <Text style={styles.devisTitle}>DEVIS</Text>
            <Text style={styles.devisMeta}>
              {"N° "}
              <Text style={styles.devisMetaStrong}>{data.numero || "—"}</Text>
            </Text>
            <Text style={styles.devisMeta}>
              {"Date "}
              <Text style={styles.devisMetaStrong}>{data.date}</Text>
            </Text>
            <Text style={styles.devisMeta}>
              {"Validité "}
              {data.validiteJours}
              {" jours"}
            </Text>
          </View>
        </View>

        {/* Émetteur / Client */}
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Émetteur</Text>
            <Text style={styles.partyName}>{soc.nom}</Text>
            <Text style={styles.partyLine}>{soc.adresse}</Text>
            <Text style={styles.partyLine}>
              {"Tél. "}
              {soc.tel}
            </Text>
            <Text style={styles.partyLine}>{soc.email}</Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Client</Text>
            <Text style={styles.partyName}>
              {data.client.etablissement || data.client.nom || "—"}
            </Text>
            {!!data.client.etablissement && !!data.client.nom && (
              <Text style={styles.partyLine}>{data.client.nom}</Text>
            )}
            {!!data.client.adresse && <Text style={styles.partyLine}>{data.client.adresse}</Text>}
            {!!data.client.tel && (
              <Text style={styles.partyLine}>
                {"Tél. "}
                {data.client.tel}
              </Text>
            )}
            {!!data.client.email && <Text style={styles.partyLine}>{data.client.email}</Text>}
          </View>
        </View>

        {/* Table */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colDesignation]}>Désignation</Text>
          <Text style={[styles.th, styles.colQty]}>Qté</Text>
          <Text style={[styles.th, styles.colPu]}>P.U. HT</Text>
          <Text style={[styles.th, styles.colTotal]}>Total HT</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]} wrap={false}>
            <Text style={[styles.td, styles.colDesignation]}>{l.designation || "—"}</Text>
            <Text style={[styles.td, styles.colQty]}>{l.qty}</Text>
            <Text style={[styles.td, styles.colPu]}>{euros(l.unitCents)}</Text>
            <Text style={[styles.td, styles.colTotal]}>
              {euros(Math.round(l.qty * l.unitCents))}
            </Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total</Text>
              <Text style={styles.totalValue}>{euros(t.sousTotal)}</Text>
            </View>
            {data.remisePct > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Remise {data.remisePct / 100}%</Text>
                <Text style={styles.totalValue}>
                  {"-"}
                  {euros(t.remise)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Livraison</Text>
              <Text style={styles.totalValue}>
                {data.livraisonCents === 0 ? "Offerte" : euros(data.livraisonCents)}
              </Text>
            </View>
            <View style={styles.totalDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{euros(t.totalHT)}</Text>
            </View>
            {data.tvaApplicable && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TVA 20%</Text>
                <Text style={styles.totalValue}>{euros(t.tva)}</Text>
              </View>
            )}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>
                {data.tvaApplicable ? "Total TTC" : "Total net"}
              </Text>
              <Text style={styles.grandValue}>{euros(t.totalTTC)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {!!(data.notes ?? "").trim() && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* Conditions */}
        <View style={styles.conditions}>
          <Text>
            {"Devis valable "}
            {data.validiteJours}
            {
              " jours à compter de sa date d'émission. Prestation de location et entretien de linge — facturation à la rotation."
            }
            {data.tvaApplicable ? "" : " TVA non applicable, art. 293 B du CGI."}
          </Text>
          {!!(data.reglement ?? "").trim() && (
            <Text style={{ marginTop: 3 }}>{data.reglement}</Text>
          )}
        </View>

        {/* Signatures */}
        <View style={styles.signWrap} wrap={false}>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>Bon pour accord — Client</Text>
            <View style={styles.signLineBox} />
            <Text style={styles.signHint}>Date, nom et signature</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>{"L'émetteur"}</Text>
            <Text style={styles.signName}>{soc.nom}</Text>
            {data.signatureSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.signatureSrc} style={styles.signImg} />
            ) : (
              <View style={styles.signLineBox} />
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            <Text style={styles.footerStrong}>{soc.nom}</Text>
            {" · "}
            {soc.adresse}
          </Text>
          <Text style={styles.footerText}>
            {soc.tel}
            {" · "}
            {soc.email}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/* ─── Download ─── */

export async function downloadDevisPdf(
  data: DevisData,
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
    <DevisDocument data={data} logoSrc={logoSrc} operator={options?.operator} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (data.numero || "linge-serein").replace(/[^a-zA-Z0-9-_]/g, "-");
  a.download = `LS-Devis-${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
