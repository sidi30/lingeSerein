"use client";

/**
 * Fiche client (CRM) — blocs Identité / Commercial / Abonnement / Timeline /
 * Stock + notes, plus la création d'une commande pour ce client.
 *
 * Contrat API :
 *   GET   /clients/:id         → fiche + subscription + 50 dernières commandes + stocks + métriques
 *   PATCH /clients/:id         → liste blanche de champs éditables
 *   POST  /clients/:id/orders  → commande pour ce client
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PauseCircle, PlayCircle, Plus, Trash2, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CascadeDeleteDialog } from "@/components/ui/cascade-delete-dialog";
import { DetailFallback } from "@/components/ui/detail-fallback";
import { detailState, invalidateAfter } from "@/lib/query";
import { EmailText } from "@/components/ui/email-text";
import { RatingStars } from "@/components/clients/rating-stars";
import { CommuneField } from "@/components/clients/commune-field";
import { OrderForm } from "@/components/orders/order-form";
import { formatDate, formatPrice } from "@/lib/format";
import { formatDeliveryFee, orderAmounts } from "@/lib/order-quote";
import {
  CLIENT_SOURCE_LABELS,
  type ClientDetailDTO,
  type DeliveryZoneDTO,
  type OrderStatus,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-700";

const ACCOMMODATION_TYPES = [
  { value: "HOTEL", label: "Hôtel" },
  { value: "GITE", label: "Gîte" },
  { value: "AIRBNB", label: "Airbnb" },
  { value: "AUBERGE", label: "Auberge" },
  { value: "AUTRE", label: "Autre" },
];

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const orderStatusConfig: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: "En attente", variant: "warning" },
  CONFIRMED: { label: "Confirmée", variant: "info" },
  IN_DELIVERY: { label: "En livraison", variant: "default" },
  DELIVERED: { label: "Livrée", variant: "success" },
  CANCELLED: { label: "Annulée", variant: "danger" },
};

const subStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: "Actif", variant: "success" },
  PAUSED: { label: "En pause", variant: "warning" },
  CANCELLED: { label: "Résilié", variant: "danger" },
  TRIAL: { label: "Essai", variant: "info" },
};

const rangeBadgeVariant: Record<string, BadgeVariant> = {
  CONFORT: "info",
  HOTEL: "default",
  PRESTIGE: "warning",
};

/** Champs éditables — strictement la liste blanche de PATCH /clients/:id. */
interface EditableFields {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  /** Code INSEE de la commune — c'est lui qui fixe le palier de livraison. */
  communeInsee: string;
  accommodationType: string;
  zoneId: string;
  preferredTimeSlot: string;
  rating: number | null;
  requirements: string;
  notes: string;
  isActive: boolean;
  stockAlertThreshold: number;
}

function toEditable(client: ClientDetailDTO): EditableFields {
  return {
    name: client.name ?? "",
    companyName: client.companyName ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    city: client.city ?? "",
    postalCode: client.postalCode ?? "",
    communeInsee: client.communeInsee ?? "",
    accommodationType: client.accommodationType ?? "",
    zoneId: client.zoneId ?? "",
    preferredTimeSlot: client.preferredTimeSlot ?? "",
    rating: client.rating,
    requirements: client.requirements ?? "",
    notes: client.notes ?? "",
    isActive: client.isActive,
    stockAlertThreshold: client.stockAlertThreshold ?? 0,
  };
}

function GaugeBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900 tabular-nums">
          {value} / {max}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-200">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * L'abonnement renvoyé par la fiche client n'expose pas toujours son `id`
 * (le DTO le déclare optionnel). Sans identifiant, aucune route de suppression
 * n'est adressable : on désactive en le disant, plutôt que d'appeler
 * `/subscriptions/undefined`.
 */
function SubscriptionDeleteButton({
  subscriptionId,
  onOpen,
}: {
  subscriptionId?: string;
  onOpen: () => void;
}) {
  if (!subscriptionId) {
    return (
      <span title="Identifiant d'abonnement absent de la fiche : suppression impossible depuis cet écran.">
        <Button size="sm" variant="ghost" disabled>
          <Trash2 className="h-4 w-4 text-danger-600" aria-hidden="true" />
          Supprimer
        </Button>
      </span>
    );
  }
  return (
    <Button size="sm" variant="ghost" onClick={onOpen}>
      <Trash2 className="h-4 w-4 text-danger-600" aria-hidden="true" />
      Supprimer
    </Button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<EditableFields | null>(null);
  const [orderModal, setOrderModal] = useState(false);
  const [linkSubModal, setLinkSubModal] = useState(false);
  const [confirmCancelSub, setConfirmCancelSub] = useState(false);
  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  const [deleteSubOpen, setDeleteSubOpen] = useState(false);
  const [subPlan, setSubPlan] = useState("");

  const clientQuery = useQuery({
    queryKey: ["client", id],
    queryFn: () => api.get<ClientDetailDTO>(`/clients/${id}`),
  });
  const client = clientQuery.data;
  const state = detailState(clientQuery, Boolean(id));

  const { data: zones } = useQuery({
    queryKey: ["settings", "zones"],
    queryFn: () => api.get<DeliveryZoneDTO[]>("/settings/zones"),
  });

  // Le formulaire est rechargé à chaque nouvelle version du client renvoyée par
  // l'API : sans ça, une sauvegarde laissait le state local diverger du serveur.
  useEffect(() => {
    if (client) setForm(toEditable(client));
  }, [client]);

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<EditableFields>) => api.patch(`/clients/${id}`, patch),
    onSuccess: () => {
      toast("Client mis à jour");
      void invalidateAfter(queryClient, "client");
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : "Erreur lors de la mise à jour", "error"),
  });

  // Abonnement — les routes admin sont montées sous /subscriptions, PAS sous
  // /clients/:id/subscription. Cet écran appelait la seconde forme : toutes les
  // actions d'abonnement renvoyaient 404.
  // Le changement de statut passe par trois routes distinctes (pause/resume/
  // cancel), et non par un PATCH portant un champ `status`.
  // Résilier sous engagement est REFUSÉ par l'API (règle des 3 mois du contrat).
  // On mémorise le refus pour proposer au propriétaire de passer outre en
  // connaissance de cause, plutôt que de lui afficher une erreur sèche sur un
  // bouton qui semble cassé.
  const [engagementBloquant, setEngagementBloquant] = useState<string | null>(null);

  const subMutation = useMutation({
    mutationFn: (
      action:
        | { type: "link"; plan: string }
        | { type: "pause" | "resume" }
        | { type: "cancel"; force?: boolean },
    ) =>
      action.type === "link"
        ? api.post(`/subscriptions/clients/${id}`, { plan: action.plan })
        : api.patch(
            `/subscriptions/clients/${id}/${action.type}`,
            action.type === "cancel" && action.force ? { force: true } : {},
          ),
    onSuccess: () => {
      toast("Abonnement mis à jour");
      setLinkSubModal(false);
      setConfirmCancelSub(false);
      setEngagementBloquant(null);
      void invalidateAfter(queryClient, "subscription", "client");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Erreur sur l'abonnement";
      const code =
        err instanceof ApiError
          ? ((err.data as { error?: { code?: string } } | undefined)?.error?.code ?? null)
          : null;

      if (code === "ENGAGEMENT_ACTIVE") {
        setEngagementBloquant(message);
        return;
      }
      toast(message, "error");
    },
  });

  const orders = useMemo(() => client?.orders ?? [], [client]);

  const averageBasketCents = useMemo(() => {
    if (!client || client.ordersCount === 0) return 0;
    return Math.round(client.revenueCents / client.ordersCount);
  }, [client]);

  // L’ordre compte : tester `!form` en premier, comme avant, transformait un
  // client absent en squelette éternel — `form` n’est alimenté que par l’effet
  // qui suit la réponse, donc jamais sur un 404, et la branche « introuvable »
  // en dessous était inatteignable.
  if (state !== "ready" || !client) {
    return (
      <>
        <Header title="Client" />
        <DetailFallback
          state={state === "ready" ? "loading" : state}
          label="Ce client"
          onRetry={() => void clientQuery.refetch()}
        />
      </>
    );
  }

  // Donnée reçue, formulaire local pas encore hydraté (un rendu d’écart).
  if (!form) {
    return (
      <>
        <Header title="Client" />
        <DetailFallback state="loading" label="Ce client" />
      </>
    );
  }

  const set = <K extends keyof EditableFields>(key: K, value: EditableFields[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const saveIdentity = () => {
    // Un champ vide doit partir en `null`, jamais en chaîne vide : le schéma
    // valide `email` en .email(), `zoneId` en .uuid() et le type d'hébergement
    // en enum. Envoyer "" faisait échouer l'enregistrement en 400 dès qu'un de
    // ces champs était vide — donc TOUJOURS, pour un client sans email ni zone,
    // c'est-à-dire exactement le client qu'on vient de rendre possible.
    // Corollaire : c'est aussi ce qui permet enfin d'EFFACER une valeur.
    const vide = (v: string) => (v.trim() === "" ? null : v.trim());

    updateMutation.mutate({
      name: form.name.trim(),
      companyName: vide(form.companyName),
      email: vide(form.email),
      phone: vide(form.phone),
      address: vide(form.address),
      city: vide(form.city),
      postalCode: vide(form.postalCode),
      communeInsee: vide(form.communeInsee),
      accommodationType: vide(form.accommodationType),
      zoneId: vide(form.zoneId),
      preferredTimeSlot: vide(form.preferredTimeSlot),
      isActive: form.isActive,
    } as Partial<EditableFields>);
  };

  const subscription = client.subscription;
  const subStatus = subscription ? subStatusConfig[subscription.status] : null;

  return (
    <>
      <Header
        title={client.companyName ?? client.name}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOrderModal(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Créer une commande
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleteClientOpen(true)}>
              <Trash2 className="h-4 w-4 text-danger-600" aria-hidden="true" />
              Supprimer le client
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* ─── En-tête ─── */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={client.isActive ? "success" : "neutral"}>
            {client.isActive ? "Actif" : "Inactif"}
          </Badge>
          <Badge variant={client.hasAppAccess ? "info" : "neutral"}>
            {client.hasAppAccess ? "app" : "hors-ligne"}
          </Badge>
          <Badge variant="neutral">{CLIENT_SOURCE_LABELS[client.source] ?? client.source}</Badge>
        </div>

        {/* ─── Identité ─── */}
        <Card
          title="Identité"
          actions={
            <Button size="sm" loading={updateMutation.isPending} onClick={saveIdentity}>
              Enregistrer
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="edit-name">
                Nom du contact
              </label>
              <input
                id="edit-name"
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-company">
                Établissement
              </label>
              <input
                id="edit-company"
                className={inputCls}
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-email">
                Email
              </label>
              <input
                id="edit-email"
                type="email"
                className={inputCls}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="Facultatif"
              />
              {!client.email && (
                <p className="mt-1 text-xs">
                  <EmailText email={null} />
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-phone">
                Téléphone
              </label>
              <input
                id="edit-phone"
                type="tel"
                inputMode="tel"
                className={inputCls}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="edit-address">
                Adresse
              </label>
              <input
                id="edit-address"
                className={inputCls}
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-postal">
                Code postal
              </label>
              <input
                id="edit-postal"
                inputMode="numeric"
                className={inputCls}
                value={form.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
              />
            </div>
            {/* La commune remplace la ville en texte libre : c'est elle qui fixe
                le palier de livraison, et le code INSEE est son seul identifiant
                stable (84100 = Orange ET Uchaux, deux paliers différents). */}
            <div>
              <CommuneField
                idPrefix="edit"
                value={{
                  communeInsee: form.communeInsee,
                  city: form.city,
                  postalCode: form.postalCode,
                }}
                onChange={(next) => setForm((prev) => (prev ? { ...prev, ...next } : prev))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-accommodation">
                Type d&apos;hébergement
              </label>
              <select
                id="edit-accommodation"
                className={inputCls}
                value={form.accommodationType}
                onChange={(e) => set("accommodationType", e.target.value)}
              >
                <option value="">Non précisé</option>
                {ACCOMMODATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-zone">
                Zone
              </label>
              <select
                id="edit-zone"
                className={inputCls}
                value={form.zoneId}
                onChange={(e) => set("zoneId", e.target.value)}
              >
                <option value="">Aucune</option>
                {(zones ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-slot">
                Créneau préféré
              </label>
              <input
                id="edit-slot"
                className={inputCls}
                maxLength={20}
                value={form.preferredTimeSlot}
                onChange={(e) => set("preferredTimeSlot", e.target.value)}
                placeholder="08:00-10:00"
              />
            </div>
            <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              <span className="text-sm text-gray-700">Client actif</span>
            </label>
          </div>
        </Card>

        {/* ─── Commercial ─── */}
        <Card title="Commercial">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Chiffre d'affaires" value={formatPrice(client.revenueCents)} />
            <Metric label="Commandes" value={String(client.ordersCount)} />
            <Metric label="Panier moyen" value={formatPrice(averageBasketCents)} />
            <Metric
              label="Dernière commande"
              value={client.lastOrderAt ? formatDate(client.lastOrderAt) : "—"}
            />
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <span className={labelCls}>Appréciation</span>
              <RatingStars
                value={form.rating}
                onChange={(value) => {
                  set("rating", value);
                  updateMutation.mutate({ rating: value });
                }}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="edit-requirements">
                Exigences particulières
              </label>
              <textarea
                id="edit-requirements"
                rows={3}
                className={inputCls}
                value={form.requirements}
                onChange={(e) => set("requirements", e.target.value)}
                placeholder="Livraison par l'arrière, ne pas sonner avant 9h..."
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={updateMutation.isPending}
                  disabled={form.requirements === (client.requirements ?? "")}
                  onClick={() => updateMutation.mutate({ requirements: form.requirements })}
                >
                  Enregistrer les exigences
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Abonnement ─── */}
        <Card
          title="Abonnement"
          actions={
            subscription && subscription.status !== "CANCELLED" ? (
              <div className="flex flex-wrap gap-2">
                {subscription.status === "PAUSED" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={subMutation.isPending}
                    onClick={() => subMutation.mutate({ type: "resume" })}
                  >
                    <PlayCircle className="h-4 w-4" aria-hidden="true" />
                    Reprendre
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={subMutation.isPending}
                    onClick={() => subMutation.mutate({ type: "pause" })}
                  >
                    <PauseCircle className="h-4 w-4" aria-hidden="true" />
                    Mettre en pause
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => setConfirmCancelSub(true)}>
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Résilier
                </Button>
                {/* Résilier ≠ supprimer. Résilier arrête le service en gardant
                    l'historique ; supprimer efface l'abonnement et ce qu'il a
                    engendré. Les deux sont proposés, avec des mots distincts. */}
                <SubscriptionDeleteButton
                  subscriptionId={subscription.id}
                  onOpen={() => setDeleteSubOpen(true)}
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setLinkSubModal(true)}>
                  Lier un abonnement
                </Button>
                {subscription && (
                  <SubscriptionDeleteButton
                    subscriptionId={subscription.id}
                    onOpen={() => setDeleteSubOpen(true)}
                  />
                )}
              </div>
            )
          }
        >
          {!subscription ? (
            <p className="text-sm text-gray-400">Aucun abonnement lié à ce client.</p>
          ) : (
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-500">Formule</p>
                <Badge variant={rangeBadgeVariant[subscription.plan] ?? "neutral"}>
                  {subscription.plan}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500">Statut</p>
                <Badge variant={subStatus?.variant ?? "neutral"}>
                  {subStatus?.label ?? subscription.status}
                </Badge>
              </div>
              {subscription.currentPeriodEnd && (
                <div>
                  <p className="text-xs text-gray-500">Période en cours jusqu&apos;au</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
              )}
              {subscription.committedUntil && (
                <div>
                  <p className="text-xs text-gray-500">Engagement jusqu&apos;au</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(subscription.committedUntil)}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ─── Timeline des commandes ─── */}
        <Card
          title="Commandes"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setOrderModal(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle
            </Button>
          }
        >
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune commande pour ce client.</p>
          ) : (
            <ol className="space-y-4">
              {orders.map((order) => {
                const sc = orderStatusConfig[order.status];
                // Même calcul que la fiche et la liste des commandes : deux
                // écrans qui affichent deux montants pour la même commande font
                // douter de tous les chiffres. `GET /clients/:id` ne renvoie pas
                // encore les frais ⇒ `deliveryFeeCents` vaut `null`, le montant
                // reste celui d'aujourd'hui, et la ligne de détail se remplira
                // d'elle-même le jour où la route sera enrichie.
                const amounts = orderAmounts(order);
                return (
                  <li key={order.id} className="relative flex gap-3 pl-1">
                    {/* Puce + trait de timeline */}
                    <div className="flex flex-col items-center">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary-500" />
                      <span className="mt-1 w-px flex-1 bg-gray-200" />
                    </div>
                    <Link
                      href={`/commandes/${order.id}`}
                      className="min-w-0 flex-1 rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{order.orderNumber}</span>
                        <Badge variant={sc?.variant ?? "neutral"}>
                          {sc?.label ?? order.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Livraison le {formatDate(order.deliveryDate)}
                        {order.timeSlot ? ` — ${order.timeSlot}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-2">
                        {/* `?? []` obligatoire : `GET /clients/:id` projette les
                            commandes avec un `select` qui ne contient PAS
                            `items`. Sans ce garde-fou, `.map` sur `undefined`
                            faisait planter la fiche de tout client ayant au
                            moins une commande. */}
                        <p className="min-w-0 text-xs text-gray-600">
                          {(order.items ?? [])
                            .map((i) => `${i.quantity}× ${i.product.name}`)
                            .join(", ")}
                        </p>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold text-gray-900 tabular-nums">
                            {formatPrice(amounts.totalCents)}
                          </span>
                          {amounts.deliveryFeeCents !== null && (
                            <span className="block text-[11px] font-normal text-gray-500">
                              dont livraison{" "}
                              {formatDeliveryFee(
                                amounts.deliveryFeeCents,
                                amounts.deliveryFeeSurDevis,
                              ).toLowerCase()}
                            </span>
                          )}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {/* ─── Stock + notes ─── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Niveaux de stock">
            {client.stocks.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun stock enregistré</p>
            ) : (
              <div className="space-y-5">
                {client.stocks.map((stock, idx) => (
                  <div key={idx}>
                    <div className="mb-2">
                      <Badge variant={rangeBadgeVariant[stock.productRange] ?? "neutral"}>
                        {stock.productRange}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <GaugeBar
                        label="Propres"
                        value={stock.cleanSets}
                        max={stock.totalInCirculation}
                        color="bg-success-500"
                      />
                      <GaugeBar
                        label="Sales"
                        value={stock.dirtySets}
                        max={stock.totalInCirculation}
                        color="bg-warning-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 border-t border-gray-100 pt-4">
              <label className={labelCls} htmlFor="edit-threshold">
                Seuil d&apos;alerte stock
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="edit-threshold"
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  className={inputCls}
                  value={form.stockAlertThreshold}
                  onChange={(e) => set("stockAlertThreshold", Number(e.target.value))}
                />
                <Button
                  variant="secondary"
                  loading={updateMutation.isPending}
                  disabled={form.stockAlertThreshold === client.stockAlertThreshold}
                  onClick={() =>
                    updateMutation.mutate({ stockAlertThreshold: form.stockAlertThreshold })
                  }
                  className="w-full sm:w-auto"
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title="Notes internes"
            actions={
              <Button
                size="sm"
                loading={updateMutation.isPending}
                disabled={form.notes === (client.notes ?? "")}
                onClick={() => updateMutation.mutate({ notes: form.notes })}
              >
                Enregistrer
              </Button>
            }
          >
            <textarea
              rows={8}
              className={inputCls}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Notes internes sur ce client..."
              aria-label="Notes internes"
            />
          </Card>
        </div>
      </div>

      {/* ─── Création de commande ─── */}
      <Modal
        open={orderModal}
        onClose={() => setOrderModal(false)}
        title="Nouvelle commande"
        className="max-w-2xl"
      >
        <OrderForm
          clientId={client.id}
          clientName={client.companyName ?? client.name}
          onCancel={() => setOrderModal(false)}
          onSuccess={(order) => {
            setOrderModal(false);
            router.push(`/commandes/${order.id}`);
          }}
        />
      </Modal>

      {/* ─── Liaison d'abonnement ─── */}
      <Modal open={linkSubModal} onClose={() => setLinkSubModal(false)} title="Lier un abonnement">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (subPlan) subMutation.mutate({ type: "link", plan: subPlan });
          }}
        >
          <div>
            <label className={labelCls} htmlFor="sub-plan">
              Formule
            </label>
            <select
              id="sub-plan"
              className={inputCls}
              value={subPlan}
              onChange={(e) => setSubPlan(e.target.value)}
              required
            >
              <option value="">Sélectionner une formule...</option>
              <option value="ESSENTIELLE">Essentielle</option>
              <option value="CONFORT">Confort</option>
              <option value="PRESTIGE">Prestige</option>
            </select>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLinkSubModal(false)}
              className="w-full sm:w-auto"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              loading={subMutation.isPending}
              disabled={!subPlan}
              className="w-full sm:w-auto"
            >
              Lier
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmCancelSub}
        onClose={() => setConfirmCancelSub(false)}
        onConfirm={() => subMutation.mutate({ type: "cancel" })}
        loading={subMutation.isPending}
        variant="danger"
        title="Résilier l'abonnement ?"
        description="L'abonnement de ce client sera résilié, en respectant le préavis."
        confirmLabel="Résilier"
      />

      {/* Second temps : l'engagement bloque. On explique la raison exacte et on
          laisse le propriétaire trancher — c'est SA règle, il peut y renoncer. */}
      <ConfirmDialog
        open={engagementBloquant !== null}
        onClose={() => setEngagementBloquant(null)}
        onConfirm={() => subMutation.mutate({ type: "cancel", force: true })}
        loading={subMutation.isPending}
        variant="danger"
        title="Engagement en cours"
        description={`${engagementBloquant ?? ""}

Vous pouvez résilier malgré tout : ce sera un geste commercial de votre part, enregistré dans l'historique.`}
        confirmLabel="Résilier quand même"
        cancelLabel="Respecter l'engagement"
      />

      {/* ─── Suppression en cascade du client ─── */}
      {deleteClientOpen && (
        <CascadeDeleteDialog
          open
          onClose={() => setDeleteClientOpen(false)}
          previewEndpoint={`/users/${client.id}/deletion-preview`}
          deleteEndpoint={`/users/${client.id}?cascade=true`}
          title={`Supprimer ${client.companyName ?? client.name} ?`}
          description="Le client et tout son historique seront supprimés. Cette action est irréversible."
          successMessage="Client et données liées supprimés"
          requireTypedText={client.companyName ?? client.name}
          anonymize={{
            endpoint: `/users/${client.id}/anonymize`,
            successMessage: "Client anonymisé — ses factures sont conservées",
          }}
          scopes={["client"]}
          removeKeys={[["client", id]]}
          onDeleted={() => router.push("/clients")}
        />
      )}

      {/* ─── Suppression en cascade de l'abonnement ─── */}
      {deleteSubOpen && subscription?.id && (
        <CascadeDeleteDialog
          open
          onClose={() => setDeleteSubOpen(false)}
          previewEndpoint={`/subscriptions/${subscription.id}/deletion-preview`}
          deleteEndpoint={`/subscriptions/${subscription.id}?cascade=true`}
          title="Supprimer cet abonnement ?"
          description="L'abonnement et les rotations qu'il a engendrées seront supprimés. Les factures déjà émises, elles, sont conservées. Cette action est irréversible."
          successMessage="Abonnement supprimé"
          requireTypedText={subscription.plan}
          scopes={["subscription", "client"]}
        />
      )}
    </>
  );
}
