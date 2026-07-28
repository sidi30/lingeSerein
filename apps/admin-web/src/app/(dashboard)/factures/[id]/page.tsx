"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DeleteAction } from "@/components/ui/delete-action";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { DetailFallback } from "@/components/ui/detail-fallback";
import { detailState, invalidateAfter } from "@/lib/query";
import { useToast } from "@/lib/toast";
import { formatPrice, formatDate } from "@/lib/format";
import { loadInvoicePdf } from "@/lib/invoice-pdf";
import { INVOICE_TRANSITIONS } from "@/lib/types";
import { normalizeInvoiceLines, InvoiceTotalsMismatchError } from "@lingengo/shared";
import type { InvoiceDTO, InvoiceStatus } from "@/lib/types";
import { Download, FileText, AlertCircle } from "lucide-react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const statusConfig: Record<InvoiceStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Brouillon", variant: "neutral" },
  SENT: { label: "Envoyée", variant: "info" },
  PAID: { label: "Payée", variant: "success" },
  OVERDUE: { label: "En retard", variant: "danger" },
  CANCELLED: { label: "Annulée", variant: "warning" },
  REFUNDED: { label: "Remboursée", variant: "warning" },
};

const statusLabelsAction: Record<InvoiceStatus, string> = {
  DRAFT: "Repasser en brouillon",
  SENT: "Marquer comme envoyée",
  PAID: "Marquer comme payée",
  OVERDUE: "Marquer en retard",
  CANCELLED: "Annuler la facture",
  REFUNDED: "Marquer comme remboursée",
};

export default function FactureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pdfAvailable, setPdfAvailable] = useState(false);

  // Le générateur de PDF de facture arrive séparément : le bouton ne s'affiche
  // que lorsque le module est réellement disponible (cf. lib/invoice-pdf.ts).
  useEffect(() => {
    let cancelled = false;
    loadInvoicePdf().then((mod) => {
      if (!cancelled) setPdfAvailable(mod !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const invoiceQuery = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.get<InvoiceDTO>(`/invoices/${id}`),
  });
  const invoice = invoiceQuery.data;
  const state = detailState(invoiceQuery, Boolean(id));

  const statusMutation = useMutation({
    mutationFn: (status: InvoiceStatus) =>
      api.patch<InvoiceDTO>(`/invoices/${id}/status`, { status }),
    onSuccess: () => {
      toast("Statut mis à jour");
      setConfirmCancel(false);
      // Encaisser ou annuler une facture déplace aussi le chiffre d’affaires du
      // tableau de bord et l’état de la commande adossée.
      void invalidateAfter(queryClient, "invoice");
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : "Erreur lors du changement de statut", "error"),
  });

  const handlePdf = async () => {
    if (!invoice) return;
    try {
      const mod = await loadInvoicePdf();
      if (!mod) {
        toast("Le générateur de PDF de facture n'est pas encore disponible", "error");
        return;
      }
      await mod.downloadInvoicePdf(invoice);
    } catch (err) {
      console.error("Génération du PDF de facture échouée", err);
      // Le garde-fou de concordance refuse d'imprimer une facture dont le détail
      // ne retombe pas sur le total enregistré : il faut le dire explicitement,
      // sinon l'admin croit à un bug du bouton et réessaie en boucle.
      if (err instanceof InvoiceTotalsMismatchError) {
        toast(
          `${err.message} Le PDF n'a pas été produit : corrigez la facture avant de l'envoyer.`,
          "error",
        );
        return;
      }
      toast(
        err instanceof Error
          ? `PDF impossible à générer : ${err.message}`
          : "PDF impossible à générer",
        "error",
      );
    }
  };

  if (state !== "ready" || !invoice) {
    return (
      <>
        <Header title="Facture" />
        <DetailFallback
          state={state === "ready" ? "loading" : state}
          label="Cette facture"
          onRetry={() => void invoiceQuery.refetch()}
        />
      </>
    );
  }

  const sc = statusConfig[invoice.status];
  const nextStatuses = INVOICE_TRANSITIONS[invoice.status];
  const canDelete = invoice.status === "DRAFT";
  // Même normalisation que le PDF : l'écran ne peut pas afficher d'autres lignes
  // que le document imprimé, quelle que soit la forme écrite en base.
  const lines = normalizeInvoiceLines(invoice.metadata?.lines);
  const clientLabel = invoice.clientNom ?? invoice.user?.name ?? "—";
  const remiseCents = invoice.metadata?.remiseCents ?? 0;
  const sousTotalCents = invoice.metadata?.sousTotalCents;
  const livraisonCents = invoice.metadata?.livraisonCents ?? 0;
  const isOverdue = invoice.status === "OVERDUE";

  return (
    <>
      <Header
        title={invoice.invoiceNumber}
        actions={
          <div className="flex flex-wrap gap-2">
            {pdfAvailable && (
              <Button variant="secondary" size="sm" onClick={handlePdf}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Télécharger PDF
              </Button>
            )}
            {/* Bouton toujours présent, désactivé hors brouillon avec sa raison :
                le propriétaire doit comprendre POURQUOI il ne peut pas supprimer
                une facture émise, pas juste ne rien trouver à cliquer. */}
            <DeleteAction
              endpoint={`/invoices/${invoice.id}`}
              itemLabel={`la facture ${invoice.invoiceNumber}`}
              label="Supprimer"
              variant="danger"
              title="Supprimer le brouillon ?"
              description={`Le brouillon ${invoice.invoiceNumber} sera supprimé. Aucune écriture comptable n'existe pour un brouillon : rien d'autre n'est affecté.`}
              successMessage="Brouillon supprimé"
              disabledReason={
                canDelete
                  ? null
                  : "Une facture émise est une pièce comptable : la loi impose de la conserver 10 ans. Elle ne peut pas être supprimée — annulez-la plutôt, elle restera dans la piste d'audit."
              }
              scopes={["invoice"]}
              removeKeys={[["invoice", id]]}
              onDeleted={() => router.push("/factures")}
            />
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Statut + transitions */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Statut :</span>
            <Badge variant={sc.variant}>{sc.label}</Badge>
          </div>
          {nextStatuses.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">Changer vers :</span>
              {nextStatuses.map((s) => (
                <Button
                  key={s}
                  variant={s === "CANCELLED" ? "danger" : "secondary"}
                  size="sm"
                  loading={statusMutation.isPending}
                  onClick={() => {
                    // L'annulation est définitive (état terminal) : on confirme.
                    if (s === "CANCELLED") setConfirmCancel(true);
                    else statusMutation.mutate(s);
                  }}
                >
                  {statusLabelsAction[s]}
                </Button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Statut définitif — aucune suite possible.</span>
          )}
          {invoice.quote && (
            <div className="ml-auto flex items-center gap-2 text-sm text-primary-600">
              <FileText className="h-4 w-4" aria-hidden="true" />
              <Link
                href={`/devis/${invoice.quote.id}`}
                className="underline hover:text-primary-700"
              >
                Devis {invoice.quote.numero}
              </Link>
            </div>
          )}
        </div>

        {isOverdue && (
          <div className="flex items-start gap-3 rounded-xl border border-danger-500 bg-danger-50 p-4 text-sm text-danger-600">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              Échéance dépassée le {formatDate(invoice.dueDate)} et paiement non enregistré. Marquez
              la facture comme payée dès réception du règlement.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Client */}
          <Card title="Client">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Nom</dt>
                <dd className="font-medium text-gray-900">{clientLabel}</dd>
              </div>
              {(invoice.clientEmail ?? invoice.user?.email) && (
                <div>
                  <dt className="text-xs text-gray-500">Email</dt>
                  <dd className="text-gray-700">{invoice.clientEmail ?? invoice.user?.email}</dd>
                </div>
              )}
              {invoice.clientAdresse && (
                <div>
                  <dt className="text-xs text-gray-500">Adresse</dt>
                  <dd className="whitespace-pre-wrap text-gray-700">{invoice.clientAdresse}</dd>
                </div>
              )}
              {invoice.user && (
                <div className="rounded-lg bg-primary-50 p-2">
                  <dt className="text-xs text-primary-600">Compte client lié</dt>
                  <dd className="text-sm font-medium text-primary-800">{invoice.user.name}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Informations */}
          <Card title="Informations">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Numéro</dt>
                <dd className="font-mono font-semibold text-gray-900">{invoice.invoiceNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Émise le</dt>
                <dd className="text-gray-700">{formatDate(invoice.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Échéance</dt>
                <dd className="text-gray-700">{formatDate(invoice.dueDate)}</dd>
              </div>
              {invoice.paidAt && (
                <div>
                  <dt className="text-xs text-gray-500">Payée le</dt>
                  <dd className="font-medium text-success-600">{formatDate(invoice.paidAt)}</dd>
                </div>
              )}
              {invoice.periodStart && invoice.periodEnd && (
                <div>
                  <dt className="text-xs text-gray-500">Période facturée</dt>
                  <dd className="text-gray-700">
                    {formatDate(invoice.periodStart)} → {formatDate(invoice.periodEnd)}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Totaux */}
          <Card title="Totaux">
            <dl className="space-y-2 text-sm">
              {sousTotalCents !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Sous-total</dt>
                  <dd className="font-medium tabular-nums">{formatPrice(sousTotalCents)}</dd>
                </div>
              )}
              {remiseCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">
                    Remise ({Math.round((invoice.metadata?.remisePct ?? 0) / 100)}%)
                  </dt>
                  <dd className="font-medium text-danger-600 tabular-nums">
                    -{formatPrice(remiseCents)}
                  </dd>
                </div>
              )}
              {livraisonCents > 0 && (
                <div className="flex justify-between gap-4">
                  {/* Libellé figé à l'émission : l'écran affiche mot pour mot ce
                      que le PDF imprimera. */}
                  <dt className="text-gray-500">
                    {invoice.metadata?.livraisonLabel ?? "Livraison"}
                  </dt>
                  <dd className="font-medium tabular-nums">{formatPrice(livraisonCents)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <dt className="text-gray-500">Total HT</dt>
                <dd className="font-medium tabular-nums">{formatPrice(invoice.totalHtCents)}</dd>
              </div>
              {invoice.vatRate > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">TVA {invoice.vatRate / 100}%</dt>
                  <dd className="font-medium tabular-nums">
                    {formatPrice(invoice.vatAmountCents)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between rounded-lg bg-primary-50 px-3 py-2">
                <dt className="font-semibold text-primary-900">
                  {invoice.vatRate > 0 ? "Total TTC" : "Total net"}
                </dt>
                <dd className="text-lg font-bold text-primary-700 tabular-nums">
                  {formatPrice(invoice.totalTtcCents)}
                </dd>
              </div>
              {invoice.metadata?.mentionLegale && (
                <p className="text-[10px] text-gray-400">{invoice.metadata.mentionLegale}</p>
              )}
            </dl>
          </Card>
        </div>

        {/* Lignes figées à l'émission */}
        <Card title="Lignes facturées">
          {lines.length === 0 ? (
            <p className="text-sm text-gray-400">
              Aucun détail de ligne enregistré pour cette facture.
            </p>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Désignation</Th>
                  <Th>Qté</Th>
                  <Th>P.U. HT</Th>
                  <Th>Total HT</Th>
                </tr>
              </Thead>
              <tbody>
                {lines.map((l, i) => (
                  <Tr key={`${l.designation}-${i}`}>
                    <Td>{l.designation}</Td>
                    <Td>{l.qty}</Td>
                    <Td className="tabular-nums">{formatPrice(l.unitCents)}</Td>
                    <Td className="tabular-nums font-medium">{formatPrice(l.totalCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="mt-3 text-xs text-gray-400">
            Ces lignes sont figées à l&apos;émission : modifier le devis source ne change plus cette
            facture.
          </p>
        </Card>

        {/* Notes reprises du devis */}
        {invoice.metadata?.notes && (
          <Card title="Notes">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{invoice.metadata.notes}</p>
          </Card>
        )}
      </div>

      {/* Confirmation annulation — état terminal */}
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => statusMutation.mutate("CANCELLED")}
        loading={statusMutation.isPending}
        variant="danger"
        title="Annuler la facture ?"
        description={`La facture ${invoice.invoiceNumber} passera au statut « Annulée ». C'est définitif : elle est conservée pour la piste d'audit, mais ne pourra plus changer d'état.`}
        confirmLabel="Annuler la facture"
      />
    </>
  );
}
