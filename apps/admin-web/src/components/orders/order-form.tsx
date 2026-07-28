"use client";

/**
 * Formulaire de création de commande, réutilisable.
 *
 * Extrait de l'écran Commandes pour être partagé avec la fiche client :
 * la fiche passe `clientId` (le sélecteur de client disparaît alors), l'écran
 * Commandes le laisse vide et le formulaire propose sa propre recherche client.
 *
 * Contrat API :
 *   POST /clients/:id/orders  { items[], deliveryDate, timeSlot?, specialNotes? }
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { EmailText } from "@/components/ui/email-text";
import { formatPrice } from "@/lib/format";
import type { ClientListDTO, PaginatedResponse, ProductV2DTO } from "@/lib/types";
import { invalidateAfter } from "@/lib/query";

const TIME_SLOTS = ["08:00-10:00", "10:00-12:00", "14:00-16:00", "16:00-18:00"];

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-700";

export interface CreatedOrder {
  id: string;
  orderNumber: string;
}

interface OrderFormProps {
  /** Si fourni, la commande est créée pour ce client et le sélecteur est masqué. */
  clientId?: string;
  clientName?: string;
  onSuccess?: (order: CreatedOrder) => void;
  onCancel?: () => void;
}

interface LineDraft {
  productId: string;
  quantity: number;
}

export function OrderForm({ clientId, clientName, onSuccess, onCancel }: OrderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pickedClientId, setPickedClientId] = useState<string | null>(clientId ?? null);
  const [pickedClientName, setPickedClientName] = useState<string | null>(clientName ?? null);
  const [clientSearch, setClientSearch] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");

  const needsClientPicker = !clientId;

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products-for-order"],
    queryFn: () =>
      api.getRaw<PaginatedResponse<ProductV2DTO>>("/products", { page: 1, limit: 100 }),
  });

  const products = useMemo(
    () => (productsData?.data ?? []).filter((p) => p.isActive),
    [productsData],
  );

  const { data: clientsData } = useQuery({
    queryKey: ["clients-for-order", clientSearch],
    queryFn: () =>
      api.getRaw<PaginatedResponse<ClientListDTO>>("/clients", {
        page: 1,
        limit: 10,
        search: clientSearch || undefined,
      }),
    enabled: needsClientPicker && !pickedClientId,
  });

  const clientOptions = clientsData?.data ?? [];

  const totalCents = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const product = products.find((p) => p.id === line.productId);
        return sum + (product ? product.priceCents * line.quantity : 0);
      }, 0),
    [lines, products],
  );

  const addLine = (productId: string) => {
    if (!productId) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { productId, quantity: 1 }];
    });
  };

  const setQuantity = (productId: string, quantity: number) => {
    if (quantity < 1) return;
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!pickedClientId) return Promise.reject(new Error("Aucun client sélectionné"));
      return api.post<CreatedOrder>(`/clients/${pickedClientId}/orders`, {
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        deliveryDate,
        timeSlot: timeSlot || undefined,
        specialNotes: specialNotes.trim() || undefined,
      });
    },
    onSuccess: async (order) => {
      toast(`Commande ${order.orderNumber} créée`);
      // Attendu avant `onSuccess` : l’appelant referme la modale et navigue,
      // et la liste qu’il affiche doit déjà connaître la commande créée.
      await invalidateAfter(queryClient, "order", "client");
      onSuccess?.(order);
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la création", "error");
    },
  });

  const canSubmit = !!pickedClientId && lines.length > 0 && !!deliveryDate;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) createMutation.mutate();
      }}
    >
      {/* ─── Client ─── */}
      {needsClientPicker && (
        <div>
          <span className={labelCls}>Client</span>
          {pickedClientId ? (
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
              <span className="text-sm font-medium text-primary-900">{pickedClientName}</span>
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-xs text-primary-700 underline sm:min-h-0"
                onClick={() => {
                  setPickedClientId(null);
                  setPickedClientName(null);
                }}
              >
                Changer
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  className={`${inputCls} pl-9`}
                  placeholder="Rechercher un client..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  aria-label="Rechercher un client"
                />
              </div>
              <ul className="max-h-44 overflow-y-auto rounded-lg border border-gray-200">
                {clientOptions.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-400">Aucun client</li>
                ) : (
                  clientOptions.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-50"
                        onClick={() => {
                          setPickedClientId(c.id);
                          setPickedClientName(c.companyName ?? c.name);
                        }}
                      >
                        <span className="text-sm font-medium text-gray-900">
                          {c.companyName ?? c.name}
                        </span>
                        <EmailText email={c.email} className="text-xs text-gray-500" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ─── Produits ─── */}
      <div>
        <label className={labelCls} htmlFor="order-product-picker">
          Ajouter un produit
        </label>
        <select
          id="order-product-picker"
          className={inputCls}
          value=""
          disabled={productsLoading}
          onChange={(e) => addLine(e.target.value)}
        >
          <option value="">
            {productsLoading ? "Chargement..." : "Sélectionner un produit..."}
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatPrice(p.priceCents)}
            </option>
          ))}
        </select>

        {lines.length > 0 && (
          <ul className="mt-3 space-y-2">
            {lines.map((line) => {
              const product = products.find((p) => p.id === line.productId);
              return (
                <li
                  key={line.productId}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {product?.name ?? "Produit inconnu"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPrice((product?.priceCents ?? 0) * line.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Diminuer la quantité"
                      className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 sm:h-8 sm:w-8"
                      onClick={() => setQuantity(line.productId, line.quantity - 1)}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Augmenter la quantité"
                      className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 sm:h-8 sm:w-8"
                      onClick={() => setQuantity(line.productId, line.quantity + 1)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Retirer la ligne"
                      className="flex h-11 w-11 items-center justify-center rounded-md text-danger-500 hover:bg-danger-50 sm:h-8 sm:w-8"
                      onClick={() => removeLine(line.productId)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ─── Livraison ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="order-delivery-date">
            Date de livraison <span className="text-danger-600">*</span>
          </label>
          <input
            id="order-delivery-date"
            type="date"
            className={inputCls}
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="order-time-slot">
            Créneau
          </label>
          <select
            id="order-time-slot"
            className={inputCls}
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
          >
            <option value="">Sans créneau</option>
            {TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="order-notes">
          Notes de livraison
        </label>
        <textarea
          id="order-notes"
          rows={3}
          className={inputCls}
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          placeholder="Code d'accès, consignes particulières..."
        />
      </div>

      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
        <span className="text-sm text-gray-600">Total estimé</span>
        <span className="text-base font-bold text-gray-900 tabular-nums">
          {formatPrice(totalCents)}
        </span>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
            Annuler
          </Button>
        )}
        <Button
          type="submit"
          loading={createMutation.isPending}
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          Créer la commande
        </Button>
      </div>
    </form>
  );
}
