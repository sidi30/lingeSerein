import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";

/* ─── Types ─── */

export interface DevisLine {
  designation: string;
  qty: number;
  unitCents: number;
}

export interface DevisData {
  numero: string;
  date: string;
  validiteJours: number;
  client: {
    nom: string;
    etablissement: string;
    adresse: string;
    email: string;
    tel: string;
  };
  lines: DevisLine[];
  remisePct: number;
  livraisonCents: number;
  notes: string;
  tvaApplicable: boolean;
}

/* ─── Branding ─── */

const FOREST = "#1b5e20";
const LAVENDER = "#5e5488";
const INK = "#1f2937";
const GRAY = "#6b7280";
const LINE = "#e5e0f0";
const CREAM = "#faf8f3";

const SOCIETE = {
  nom: "Linge Serein",
  baseline: "Votre linge, notre sérénité",
  adresse: "Rue Simone Weil, 84100 Orange, Vaucluse",
  tel: "07 53 56 95 48",
  email: "lingeserein@gmail.com",
};

/* ─── Helpers ─── */

function euros(cents: number): string {
  if (!Number.isFinite(cents)) return "0,00 €";
  return (
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

export function computeDevisTotals(d: DevisData) {
  const sousTotal = d.lines.reduce((s, l) => s + Math.round(l.qty * l.unitCents), 0);
  const remise = Math.round((sousTotal * d.remisePct) / 100);
  const totalHT = sousTotal - remise + d.livraisonCents;
  const tva = d.tvaApplicable ? Math.round(totalHT * 0.2) : 0;
  const totalTTC = totalHT + tva;
  return { sousTotal, remise, totalHT, tva, totalTTC };
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
  /* Header */
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
  /* Parties */
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
  /* Table */
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
  /* Totals */
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totalsBox: { width: 240 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
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
  /* Notes */
  notesBox: {
    marginTop: 22,
    borderLeftWidth: 3,
    borderLeftColor: LAVENDER,
    paddingLeft: 10,
  },
  notesLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  notesText: { fontSize: 9, color: GRAY, lineHeight: 1.5 },
  /* Conditions */
  conditions: { marginTop: 18, fontSize: 8, color: GRAY, lineHeight: 1.5 },
  /* Footer */
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
});

/* ─── Document ─── */

export function DevisDocument({ data, logoSrc }: { data: DevisData; logoSrc?: string }) {
  const t = computeDevisTotals(data);

  return (
    <Document
      title={`Devis ${data.numero}`}
      author={SOCIETE.nom}
      subject={`Devis pour ${data.client.nom || data.client.etablissement || "client"}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>{SOCIETE.nom}</Text>
            )}
            <Text style={styles.baseline}>{SOCIETE.baseline}</Text>
          </View>
          <View style={styles.devisTitleWrap}>
            <Text style={styles.devisTitle}>DEVIS</Text>
            <Text style={styles.devisMeta}>
              N° <Text style={styles.devisMetaStrong}>{data.numero || "—"}</Text>
            </Text>
            <Text style={styles.devisMeta}>
              Date <Text style={styles.devisMetaStrong}>{data.date}</Text>
            </Text>
            <Text style={styles.devisMeta}>Validité {data.validiteJours} jours</Text>
          </View>
        </View>

        {/* Émetteur / Client */}
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Émetteur</Text>
            <Text style={styles.partyName}>{SOCIETE.nom}</Text>
            <Text style={styles.partyLine}>{SOCIETE.adresse}</Text>
            <Text style={styles.partyLine}>Tél. {SOCIETE.tel}</Text>
            <Text style={styles.partyLine}>{SOCIETE.email}</Text>
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
            {!!data.client.tel && <Text style={styles.partyLine}>Tél. {data.client.tel}</Text>}
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
                <Text style={styles.totalLabel}>Remise {data.remisePct}%</Text>
                <Text style={styles.totalValue}>-{euros(t.remise)}</Text>
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
        {!!data.notes.trim() && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* Conditions */}
        <View style={styles.conditions}>
          <Text>
            Devis valable {data.validiteJours} jours à compter de sa date d&apos;émission.
            Prestation de location et entretien de linge — facturation à la rotation.
            {data.tvaApplicable ? "" : " TVA non applicable, art. 293 B du CGI."}
          </Text>
          <Text style={{ marginTop: 4 }}>Bon pour accord (date + signature) :</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            <Text style={styles.footerStrong}>{SOCIETE.nom}</Text> · {SOCIETE.adresse}
          </Text>
          <Text style={styles.footerText}>
            {SOCIETE.tel} · {SOCIETE.email}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/* ─── Download ─── */

export async function downloadDevisPdf(data: DevisData) {
  // Logo embarqué : on tente l'image de marque, sinon fallback texte dans le doc.
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

  const blob = await pdf(<DevisDocument data={data} logoSrc={logoSrc} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (data.numero || "linge-serein").replace(/[^a-zA-Z0-9-_]/g, "-");
  a.download = `devis-${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
