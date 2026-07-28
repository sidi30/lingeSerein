/**
 * Rendu PDF des factures Linge Serein.
 * Importer via import dynamique (lazy) pour ne pas charger @react-pdf/renderer
 * dans le bundle SSR :
 *   const { downloadInvoicePdf } = await import("@lingengo/ui/invoice-pdf");
 *
 * NON utilisable côté serveur (Node/Fastify) — contient du JSX React.
 *
 * La facture est un document FIGÉ : ce module AFFICHE le snapshot enregistré à
 * l'émission (lignes, remise, livraison, totaux) et ne recalcule jamais un
 * barème. Il vérifie seulement que le snapshot est cohérent avec lui-même
 * (voir `checkInvoiceTotals`).
 */

import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import type { InvoiceForPdf } from "@lingengo/shared";
import {
  INVOICE_WARNING_LABELS,
  InvoiceTotalsMismatchError,
  checkInvoiceTotals,
  deliveryLabelFromCents,
  normalizeInvoiceLines,
} from "@lingengo/shared";
import { LOGO_DATA_URI } from "./logo";
import { legalMentionsLine, resolvePrestataire } from "./operator";
import type { OperatorInfo } from "./operator";

export type { OperatorInfo } from "./operator";

/* ─── Branding ─── */

const FOREST = "#1b5e20";
const LAVENDER = "#5e5488";
const INK = "#1f2937";
const GRAY = "#6b7280";
const LINE = "#e5e0f0";
const CREAM = "#faf8f3";
const RED = "#b3261e";
const AMBER = "#8a5a00";

/* ─── Mentions obligatoires entre professionnels ─── */

/**
 * Pénalités et indemnité de recouvrement : mentions obligatoires sur toute
 * facture entre professionnels (art. L. 441-10 et D. 441-5 du Code de commerce).
 * Leur absence est sanctionnable — ne pas retirer.
 */
const PENALITES_TEXT =
  "Pénalités de retard : taux d'intérêt de la Banque centrale européenne majoré de 10 points, " +
  "exigibles de plein droit le jour suivant la date de règlement figurant sur la facture, sans " +
  "mise en demeure préalable. Indemnité forfaitaire pour frais de recouvrement : 40 € " +
  "(art. L. 441-10 et D. 441-5 du Code de commerce). Pas d'escompte pour paiement anticipé.";

const REGLEMENT_DEFAUT =
  "Règlement par virement bancaire à réception de la facture. Coordonnées bancaires communiquées " +
  "sur demande ; merci de rappeler le numéro de facture en référence du virement.";

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

/** Date ISO → jj/mm/aaaa. Retourne « — » si la date est absente ou invalide. */
function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Bandeau de statut : couleur + texte, ou null pour une facture ordinaire. */
function statusBanner(invoice: InvoiceForPdf): { color: string; text: string } | null {
  switch (invoice.status) {
    case "CANCELLED":
      return {
        color: RED,
        text: "Facture annulée — ce document ne vaut ni demande de paiement ni pièce comptable.",
      };
    case "REFUNDED":
      return { color: RED, text: "Facture remboursée — les sommes versées ont été restituées." };
    case "PAID":
      return { color: FOREST, text: `Acquittée le ${formatDate(invoice.paidAt)}. Merci.` };
    case "OVERDUE":
      return {
        color: AMBER,
        text: `Échue depuis le ${formatDate(invoice.dueDate)} — règlement attendu sans délai.`,
      };
    case "DRAFT":
      return {
        color: GRAY,
        text: "Brouillon — facture non émise, montants susceptibles d'évoluer.",
      };
    default:
      return null;
  }
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingHorizontal: 40,
    paddingBottom: 60,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  logo: { width: 130, height: 46, objectFit: "contain" },
  logoFallback: { fontFamily: "Times-Bold", fontSize: 20, color: FOREST },
  baseline: { fontSize: 8, color: GRAY, marginTop: 2 },
  titleWrap: { alignItems: "flex-end" },
  title: { fontFamily: "Times-Bold", fontSize: 26, color: FOREST, letterSpacing: 1 },
  meta: { fontSize: 9, color: GRAY, marginTop: 4, textAlign: "right" },
  metaStrong: { color: INK, fontFamily: "Helvetica-Bold" },
  /* Bandeau statut */
  banner: {
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  bannerText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  /* Parties */
  parties: { flexDirection: "row", gap: 16, marginBottom: 18 },
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
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#ffffff" },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
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
  emptyTable: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 5,
    padding: 12,
    backgroundColor: CREAM,
  },
  emptyText: { fontSize: 8.5, color: GRAY },
  /* Totaux */
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totalsBox: { width: 250 },
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
  grandRowMuted: { backgroundColor: GRAY },
  grandLabel: { fontFamily: "Times-Bold", fontSize: 11, color: "#ffffff" },
  grandValue: { fontFamily: "Times-Bold", fontSize: 13, color: "#ffffff" },
  vatMention: { fontSize: 8, color: INK, marginTop: 6, textAlign: "right" },
  /* Notes */
  notesBox: { marginTop: 18, borderLeftWidth: 3, borderLeftColor: LAVENDER, paddingLeft: 10 },
  notesLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: LAVENDER,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  notesText: { fontSize: 9, color: GRAY, lineHeight: 1.5 },
  /* Mentions de pied */
  legalWrap: { marginTop: 18, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  legalStrong: { fontSize: 8, color: INK, lineHeight: 1.5, marginBottom: 4 },
  legalText: { fontSize: 7.5, color: GRAY, lineHeight: 1.5, marginBottom: 4 },
  /* Filigrane */
  watermarkWrap: {
    position: "absolute",
    top: "35%",
    left: "8%",
    right: "8%",
    opacity: 0.1,
    transform: "rotate(-30deg)",
  },
  watermarkText: {
    fontFamily: "Times-Bold",
    fontSize: 58,
    color: GRAY,
    textAlign: "center",
    letterSpacing: 4,
  },
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
  pageNum: { fontSize: 7.5, color: GRAY },
});

/* ─── Document ─── */

export function InvoiceDocument({
  invoice,
  logoSrc,
  operator,
}: {
  invoice: InvoiceForPdf;
  logoSrc?: string;
  operator?: OperatorInfo;
}) {
  const soc = resolvePrestataire(operator);
  const meta = invoice.metadata ?? {};
  const lines = normalizeInvoiceLines(meta.lines);

  // Snapshot figé : on affiche les montants enregistrés, jamais un recalcul.
  const sousTotalCents = meta.sousTotalCents ?? lines.reduce((s, l) => s + l.totalCents, 0);
  const remiseCents = meta.remiseCents ?? 0;
  const livraisonCents = meta.livraisonCents ?? 0;
  const livraisonLabel =
    (meta.livraisonLabel ?? "").trim() || deliveryLabelFromCents(livraisonCents);
  const tvaApplicable = invoice.vatRate > 0;

  const banner = statusBanner(invoice);
  const watermark = INVOICE_WARNING_LABELS[invoice.status];
  const annulee = invoice.status === "CANCELLED" || invoice.status === "REFUNDED";
  const clientNom = invoice.clientNom || invoice.user?.name || "Client";
  const devisNumero = invoice.quote?.numero || meta.quoteNumero;
  const periode =
    invoice.periodStart && invoice.periodEnd
      ? `${formatDate(invoice.periodStart)} — ${formatDate(invoice.periodEnd)}`
      : null;

  return (
    <Document
      title={`Facture ${invoice.invoiceNumber}`}
      author={soc.nomCommercial}
      subject={`Facture ${invoice.invoiceNumber} — ${clientNom}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Filigrane des statuts qui ne doivent pas passer pour une facture due */}
        {!!watermark && (
          <View style={styles.watermarkWrap} fixed>
            <Text style={styles.watermarkText}>{watermark}</Text>
          </View>
        )}

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
            <Text style={styles.title}>FACTURE</Text>
            <Text style={styles.meta}>
              {"N° "}
              <Text style={styles.metaStrong}>{invoice.invoiceNumber}</Text>
            </Text>
            <Text style={styles.meta}>
              {"Émise le "}
              <Text style={styles.metaStrong}>{formatDate(invoice.createdAt)}</Text>
            </Text>
            <Text style={styles.meta}>
              {"Échéance "}
              <Text style={styles.metaStrong}>{formatDate(invoice.dueDate)}</Text>
            </Text>
            {!!devisNumero && <Text style={styles.meta}>Devis n° {devisNumero}</Text>}
            {!!periode && <Text style={styles.meta}>Période {periode}</Text>}
          </View>
        </View>

        {/* Bandeau de statut */}
        {!!banner && (
          <View style={[styles.banner, { borderColor: banner.color }]}>
            <Text style={[styles.bannerText, { color: banner.color }]}>{banner.text}</Text>
          </View>
        )}

        {/* Émetteur / Client */}
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Émetteur</Text>
            <Text style={styles.partyName}>{soc.nomCommercial}</Text>
            <Text style={styles.partyLine}>
              {soc.raisonSociale} — {soc.representant}
            </Text>
            <Text style={styles.partyLine}>SIRET {soc.siret}</Text>
            <Text style={styles.partyLine}>{soc.adresse}</Text>
            <Text style={styles.partyLine}>
              {soc.tel} · {soc.email}
            </Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Facturé à</Text>
            <Text style={styles.partyName}>{clientNom}</Text>
            {!!invoice.clientAdresse && (
              <Text style={styles.partyLine}>{invoice.clientAdresse}</Text>
            )}
            {!!(invoice.clientEmail || invoice.user?.email) && (
              <Text style={styles.partyLine}>{invoice.clientEmail || invoice.user?.email}</Text>
            )}
            {!!meta.plan && <Text style={styles.partyLine}>Formule : {meta.plan}</Text>}
          </View>
        </View>

        {/* Lignes */}
        {lines.length > 0 ? (
          <>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colDesignation]}>Désignation</Text>
              <Text style={[styles.th, styles.colQty]}>Qté</Text>
              <Text style={[styles.th, styles.colPu]}>P.U. HT</Text>
              <Text style={[styles.th, styles.colTotal]}>Total HT</Text>
            </View>
            {lines.map((l, i) => (
              <View
                key={i}
                style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]}
                wrap={false}
              >
                <Text style={[styles.td, styles.colDesignation]}>{l.designation || "—"}</Text>
                <Text style={[styles.td, styles.colQty]}>{l.qty}</Text>
                <Text style={[styles.td, styles.colPu]}>{euros(l.unitCents)}</Text>
                <Text style={[styles.td, styles.colTotal]}>{euros(l.totalCents)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyTable}>
            <Text style={styles.emptyText}>
              Prestation de location et entretien de linge
              {periode ? ` — période du ${periode}` : ""}
              {meta.plan ? ` (${meta.plan})` : ""}.
            </Text>
          </View>
        )}

        {/* Totaux — montants figés */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total</Text>
              <Text style={styles.totalValue}>{euros(sousTotalCents)}</Text>
            </View>
            {remiseCents > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Remise{meta.remisePct ? ` ${meta.remisePct / 100} %` : ""}
                </Text>
                <Text style={styles.totalValue}>{"-" + euros(remiseCents)}</Text>
              </View>
            )}
            {livraisonCents > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{livraisonLabel}</Text>
                <Text style={styles.totalValue}>{euros(livraisonCents)}</Text>
              </View>
            )}
            <View style={styles.totalDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{euros(invoice.totalHtCents)}</Text>
            </View>
            {tvaApplicable && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TVA {invoice.vatRate / 100} %</Text>
                <Text style={styles.totalValue}>{euros(invoice.vatAmountCents)}</Text>
              </View>
            )}
            <View style={[styles.grandRow, ...(annulee ? [styles.grandRowMuted] : [])]}>
              <Text style={styles.grandLabel}>
                {annulee ? "Total annulé" : tvaApplicable ? "Net à payer TTC" : "Net à payer"}
              </Text>
              <Text style={styles.grandValue}>{euros(invoice.totalTtcCents)}</Text>
            </View>
            {!tvaApplicable && (
              <Text style={styles.vatMention}>
                {meta.mentionLegale || "TVA non applicable, art. 293 B du CGI."}
              </Text>
            )}
          </View>
        </View>

        {/* Notes */}
        {!!(meta.notes ?? "").trim() && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{meta.notes}</Text>
          </View>
        )}

        {/* Mentions obligatoires */}
        <View style={styles.legalWrap}>
          <Text style={styles.legalStrong}>
            {"Échéance de paiement : "}
            {formatDate(invoice.dueDate)}
            {". "}
            {(meta.reglement ?? "").trim() || REGLEMENT_DEFAUT}
          </Text>
          <Text style={styles.legalText}>{PENALITES_TEXT}</Text>
          <Text style={styles.legalText}>{legalMentionsLine(operator)}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            <Text style={styles.footerStrong}>{soc.nomCommercial}</Text>
            {" · Facture "}
            {invoice.invoiceNumber}
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

export async function downloadInvoicePdf(
  invoice: InvoiceForPdf,
  options?: { operator?: OperatorInfo; logoUrl?: string },
): Promise<void> {
  // Garde-fou : le détail imprimé doit retomber sur le total HT enregistré.
  // On ne recalcule aucun barème — on refuse seulement d'imprimer une facture
  // dont le tableau ne somme pas au total qu'elle annonce.
  const check = checkInvoiceTotals(invoice);
  if (check.verifiable && !check.ok) {
    throw new InvoiceTotalsMismatchError(check.totalHtCents, check.computedCents);
  }

  // Logo embarqué (data-URI) TOUJOURS disponible → jamais de fallback texte.
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
    <InvoiceDocument invoice={invoice} logoSrc={logoSrc} operator={options?.operator} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (invoice.invoiceNumber || "facture").replace(/[^a-zA-Z0-9-_]/g, "-");
  a.download = `${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
