"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/toast";
import { formatPrice, formatDate } from "@/lib/format";
import { QUOTE_TRANSITIONS, QUOTE_EDITABLE, quoteToDevisData } from "@lingengo/shared";
import type { QuoteDTO, QuoteStatus, ProductDTO } from "@/lib/types";
import { Download, Copy, Trash2, ArrowRight, Edit, AlertCircle, CheckCircle2 } from "lucide-react";
import { DevisForm } from "@/components/devis/devis-form";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const statusConfig: Record<QuoteStatus, { label: string; variant: BadgeVariant }> = {
  BROUILLON: { label: "Brouillon", variant: "neutral" },
  ENVOYE: { label: "Envoyé", variant: "info" },
  ACCEPTE: { label: "Accepté", variant: "success" },
  REFUSE: { label: "Refusé", variant: "danger" },
  EXPIRE: { label: "Expiré", variant: "warning" },
};

const statusLabelsAction: Partial<Record<QuoteStatus, string>> = {
  ENVOYE: "Marquer comme envoyé",
  ACCEPTE: "Marquer comme accepté",
  REFUSE: "Marquer comme refusé",
  EXPIRE: "Marquer comme expiré",
};

export default function DevisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [convertModal, setConvertModal] = useState(false);
  const [clientRequiredModal, setClientRequiredModal] = useState(false);

  // Mapping ligne → produit pour la conversion
  const [lineProductMapping, setLineProductMapping] = useState<Record<string, string>>({});
  const [deliveryDate, setDeliveryDate] = useState("");

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote", id],
    queryFn: () => api.get<QuoteDTO>(`/quotes/${id}`),
  });

  const { data: products } = useQuery({
    queryKey: ["products-for-convert"],
    queryFn: () => api.get<ProductDTO[]>("/products"),
    enabled: convertModal,
  });

  // Changement de statut
  const statusMutation = useMutation({
    mutationFn: (status: QuoteStatus) => api.patch<QuoteDTO>(`/quotes/${id}/status`, { status }),
    onSuccess: () => {
      toast("Statut mis à jour");
      queryClient.invalidateQueries({ queryKey: ["quote", id] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur lors du changement de statut";
      toast(msg, "error");
    },
  });

  // Duplication
  const duplicateMutation = useMutation({
    mutationFn: () => api.post<QuoteDTO>(`/quotes/${id}/duplicate`),
    onSuccess: (newQuote) => {
      toast("Devis dupliqué");
      router.push(`/devis/${newQuote.id}`);
    },
    onError: () => toast("Erreur lors de la duplication", "error"),
  });

  // Suppression
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/quotes/${id}`),
    onSuccess: () => {
      toast("Devis supprimé");
      router.push("/devis");
    },
    onError: () => toast("Erreur lors de la suppression", "error"),
  });

  // Conversion en commande
  const convertMutation = useMutation({
    mutationFn: () => {
      if (!quote) return Promise.reject(new Error("Devis introuvable"));
      const lineMappings = quote.lignes.map((l) => ({
        quoteLineId: l.id,
        productId: lineProductMapping[l.id] ?? "",
      }));
      return api.post<{ orderId: string; orderNumber: string }>(`/quotes/${id}/convert`, {
        deliveryDate,
        lineMappings,
      });
    },
    onSuccess: (result) => {
      toast("Devis converti en commande");
      router.push(`/commandes/${result.orderId}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: { code?: string } } | undefined;
        if (data?.error?.code === "CLIENT_REQUIRED") {
          setConvertModal(false);
          setClientRequiredModal(true);
          return;
        }
      }
      toast(err instanceof Error ? err.message : "Erreur lors de la conversion", "error");
    },
  });

  // Téléchargement PDF
  const handlePdf = async () => {
    if (!quote) return;
    const { downloadDevisPdf } = await import("@lingengo/ui/devis-pdf");
    const data = quoteToDevisData(quote);
    await downloadDevisPdf(data);
  };

  if (isLoading) {
    return (
      <>
        <Header title="Devis" />
        <div className="space-y-6 p-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (!quote) {
    return (
      <>
        <Header title="Devis" />
        <div className="flex items-center justify-center p-12 text-gray-400">Devis introuvable</div>
      </>
    );
  }

  if (editMode && QUOTE_EDITABLE.includes(quote.status)) {
    return (
      <DevisForm
        mode="edit"
        initialData={quote}
        onSuccess={() => {
          setEditMode(false);
          queryClient.invalidateQueries({ queryKey: ["quote", id] });
        }}
        onCancel={() => setEditMode(false)}
      />
    );
  }

  const sc = statusConfig[quote.status];
  const nextStatuses = QUOTE_TRANSITIONS[quote.status];
  const isEditable = QUOTE_EDITABLE.includes(quote.status);
  const canDelete = quote.status === "BROUILLON";
  const canConvert = quote.status === "ACCEPTE" && !quote.convertedToOrderId;

  return (
    <>
      <Header
        title={quote.numero}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handlePdf}>
              <Download className="h-4 w-4" aria-hidden="true" />
              PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={duplicateMutation.isPending}
              onClick={() => duplicateMutation.mutate()}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Dupliquer
            </Button>
            {isEditable && (
              <Button size="sm" variant="secondary" onClick={() => setEditMode(true)}>
                <Edit className="h-4 w-4" aria-hidden="true" />
                Modifier
              </Button>
            )}
            {canConvert && (
              <Button size="sm" onClick={() => setConvertModal(true)}>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                Convertir en commande
              </Button>
            )}
            {canDelete && (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Supprimer
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-6 p-6">
        {/* Statut actuel + transitions */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Statut :</span>
            <Badge variant={sc.variant}>{sc.label}</Badge>
          </div>
          {nextStatuses.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Changer vers :</span>
              {nextStatuses.map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  size="sm"
                  loading={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(s)}
                >
                  {statusLabelsAction[s] ?? s}
                </Button>
              ))}
            </div>
          )}
          {quote.convertedToOrderId && (
            <div className="ml-auto flex items-center gap-2 text-sm text-success-600">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <Link
                href={`/commandes/${quote.convertedToOrderId}`}
                className="underline hover:text-success-700"
              >
                Voir la commande
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Client */}
          <Card title="Client">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Nom</dt>
                <dd className="font-medium text-gray-900">{quote.clientNom}</dd>
              </div>
              {quote.clientEmail && (
                <div>
                  <dt className="text-xs text-gray-500">Email</dt>
                  <dd className="text-gray-700">{quote.clientEmail}</dd>
                </div>
              )}
              {quote.clientTel && (
                <div>
                  <dt className="text-xs text-gray-500">Téléphone</dt>
                  <dd className="text-gray-700">{quote.clientTel}</dd>
                </div>
              )}
              {quote.clientAdresse && (
                <div>
                  <dt className="text-xs text-gray-500">Adresse</dt>
                  <dd className="text-gray-700">{quote.clientAdresse}</dd>
                </div>
              )}
              {quote.user && (
                <div className="rounded-lg bg-primary-50 p-2">
                  <dt className="text-xs text-primary-600">Compte client lié</dt>
                  <dd className="text-sm font-medium text-primary-800">{quote.user.name}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Informations */}
          <Card title="Informations">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Numéro</dt>
                <dd className="font-mono font-semibold text-gray-900">{quote.numero}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Créé le</dt>
                <dd className="text-gray-700">{formatDate(quote.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Validité</dt>
                <dd className="text-gray-700">{quote.validiteJours} jours</dd>
              </div>
              {quote.dateEnvoi && (
                <div>
                  <dt className="text-xs text-gray-500">Envoyé le</dt>
                  <dd className="text-gray-700">{formatDate(quote.dateEnvoi)}</dd>
                </div>
              )}
              {quote.dateReponse && (
                <div>
                  <dt className="text-xs text-gray-500">Réponse le</dt>
                  <dd className="text-gray-700">{formatDate(quote.dateReponse)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Totaux */}
          <Card title="Totaux">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Sous-total</dt>
                <dd className="font-medium tabular-nums">{formatPrice(quote.totals.sousTotal)}</dd>
              </div>
              {quote.totals.remise > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Remise ({Math.round(quote.remisePct / 100)}%)</dt>
                  <dd className="font-medium text-danger-600 tabular-nums">
                    -{formatPrice(quote.totals.remise)}
                  </dd>
                </div>
              )}
              {quote.livraisonCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Livraison</dt>
                  <dd className="font-medium tabular-nums">{formatPrice(quote.livraisonCents)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <dt className="text-gray-500">Total HT</dt>
                <dd className="font-medium tabular-nums">{formatPrice(quote.totals.totalHT)}</dd>
              </div>
              {quote.tvaApplicable && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">TVA 20%</dt>
                  <dd className="font-medium tabular-nums">{formatPrice(quote.totals.tva)}</dd>
                </div>
              )}
              <div className="flex justify-between rounded-lg bg-primary-50 px-3 py-2">
                <dt className="font-semibold text-primary-900">
                  {quote.tvaApplicable ? "Total TTC" : "Total net"}
                </dt>
                <dd className="text-lg font-bold text-primary-700 tabular-nums">
                  {formatPrice(quote.totals.totalTTC)}
                </dd>
              </div>
              {!quote.tvaApplicable && (
                <p className="text-[10px] text-gray-400">TVA non applicable, art. 293 B du CGI</p>
              )}
            </dl>
          </Card>
        </div>

        {/* Lignes */}
        <Card title="Lignes du devis">
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
              {quote.lignes.map((l) => (
                <Tr key={l.id}>
                  <Td>{l.designation}</Td>
                  <Td>{l.qty}</Td>
                  <Td className="tabular-nums">{formatPrice(l.unitCents)}</Td>
                  <Td className="tabular-nums font-medium">{formatPrice(l.qty * l.unitCents)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Notes */}
        {quote.notes && (
          <Card title="Notes">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{quote.notes}</p>
          </Card>
        )}
      </div>

      {/* Modal conversion */}
      <Modal
        open={convertModal}
        onClose={() => setConvertModal(false)}
        title="Convertir en commande"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-warning-50 p-3 text-sm text-warning-700">
            <AlertCircle className="mb-1 inline h-4 w-4" aria-hidden="true" /> Sélectionnez le
            produit catalogue correspondant à chaque ligne et la date de livraison.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="delivery-date">
              Date de livraison <span className="text-danger-600">*</span>
            </label>
            <input
              id="delivery-date"
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Mapping lignes → produits catalogue
            </p>
            {quote.lignes.map((l) => (
              <div key={l.id} className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">{l.designation}</p>
                  <p className="text-xs text-gray-500">
                    {l.qty} × {formatPrice(l.unitCents)}
                  </p>
                </div>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  value={lineProductMapping[l.id] ?? ""}
                  onChange={(e) =>
                    setLineProductMapping((prev) => ({ ...prev, [l.id]: e.target.value }))
                  }
                  aria-label={`Produit pour ${l.designation}`}
                >
                  <option value="">Sélectionner un produit...</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.range})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setConvertModal(false)}>
              Annuler
            </Button>
            <Button
              loading={convertMutation.isPending}
              disabled={!deliveryDate}
              onClick={() => convertMutation.mutate()}
            >
              Convertir
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal client requis */}
      <Modal
        open={clientRequiredModal}
        onClose={() => setClientRequiredModal(false)}
        title="Compte client requis"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-500" aria-hidden="true" />
            <p className="text-sm text-gray-700">
              Ce devis doit être lié à un compte client avant d&apos;être converti en commande.
              Modifiez le devis pour sélectionner ou créer un compte client.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setClientRequiredModal(false)}>
              Fermer
            </Button>
            <Button
              onClick={() => {
                setClientRequiredModal(false);
                setEditMode(true);
              }}
            >
              Modifier le devis
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation suppression */}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        variant="danger"
        title="Supprimer le devis ?"
        description={`Le devis ${quote.numero} sera supprimé définitivement. Cette action est irréversible.`}
        confirmLabel="Supprimer"
      />
    </>
  );
}
