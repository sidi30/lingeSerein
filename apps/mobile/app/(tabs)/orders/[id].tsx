import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import {
  useOrder,
  useCancelOrder,
  useUpdateOrderStatus,
  formatCents,
  formatDate,
  errorMessage,
} from "@/lib/api";
import type { StatusHistoryEntry } from "@/lib/api";
import { DELIVERY_FEE_A_CONFIRMER, orderTotals } from "@/lib/order-total";
import { detailState } from "@/lib/query";
import { useAuthStore } from "@/lib/store";
import { colors, font, spacing, radius } from "@/lib/theme";

// ─── Status timeline config ───────────────────────────────────────

const STATUS_FLOW = ["PENDING", "CONFIRMED", "IN_DELIVERY", "DELIVERED"];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  IN_DELIVERY: "En livraison",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};

const STATUS_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  PENDING: "hourglass-outline",
  CONFIRMED: "checkmark-circle-outline",
  IN_DELIVERY: "car-outline",
  DELIVERED: "home-outline",
  CANCELLED: "close-circle-outline",
};

// ─── StatusTimeline ───────────────────────────────────────────────

function StatusTimeline({
  currentStatus,
  history,
}: {
  currentStatus: string;
  history?: StatusHistoryEntry[];
}) {
  const isCancelled = currentStatus === "CANCELLED";
  const currentIdx = STATUS_FLOW.indexOf(currentStatus);

  return (
    <Card style={styles.timelineCard}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Progression
      </Text>
      {isCancelled ? (
        <View style={styles.cancelledRow}>
          <View style={[styles.timelineDot, styles.timelineDotError]}>
            <Ionicons name="close" size={14} color={colors.textInverse} />
          </View>
          <View>
            <Text style={styles.timelineLabel}>Commande annulée</Text>
            {history?.find((h) => h.to === "CANCELLED")?.raison && (
              <Text style={styles.timelineSub}>
                {history.find((h) => h.to === "CANCELLED")?.raison}
              </Text>
            )}
          </View>
        </View>
      ) : (
        STATUS_FLOW.map((status, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          const histEntry = history?.find((h) => h.to === status);
          const isLast = i === STATUS_FLOW.length - 1;

          return (
            <Animated.View
              key={status}
              entering={FadeInDown.delay(i * 60).duration(250)}
              style={styles.timelineRow}
            >
              {/* Vertical line */}
              {!isLast && (
                <View
                  style={[styles.timelineLine, done && i < currentIdx && styles.timelineLineDone]}
                />
              )}

              {/* Dot */}
              <View
                style={[
                  styles.timelineDot,
                  done && styles.timelineDotDone,
                  active && styles.timelineDotActive,
                ]}
                accessibilityLabel={`${STATUS_LABELS[status]}${active ? " (statut actuel)" : done ? " (terminé)" : ""}`}
              >
                {done ? (
                  <Ionicons
                    name={active ? (STATUS_ICONS[status] ?? "ellipse") : "checkmark"}
                    size={12}
                    color={colors.textInverse}
                  />
                ) : (
                  <View style={styles.timelineDotInner} />
                )}
              </View>

              {/* Text */}
              <View style={styles.timelineContent}>
                <Text
                  style={[
                    styles.timelineLabel,
                    active && styles.timelineLabelActive,
                    !done && styles.timelineLabelFuture,
                  ]}
                >
                  {STATUS_LABELS[status] ?? status}
                </Text>
                {histEntry?.at && (
                  <Text style={styles.timelineSub}>{formatDate(histEntry.at)}</Text>
                )}
                {active && !histEntry && (
                  <Text style={[styles.timelineSub, { color: colors.primary }]}>Statut actuel</Text>
                )}
              </View>
            </Animated.View>
          );
        })
      )}
    </Card>
  );
}

// ─── Admin action modal ───────────────────────────────────────────

function RefuseModal({
  visible,
  onConfirm,
  onCancel,
  loading,
}: {
  visible: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const insets = useSafeAreaInsets();

  // Modal reste monté entre ouvertures → reset des états à la fermeture.
  useEffect(() => {
    if (!visible) {
      setReason("");
      setError(false);
    }
  }, [visible]);

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError(true);
      return;
    }
    setError(false);
    onConfirm(reason.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onCancel} />
        <View style={[styles.modalSheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Refuser la commande</Text>
          <Text style={styles.modalSubtitle}>La raison du refus sera communiquée au client.</Text>
          <Text style={styles.inputLabel}>Raison du refus *</Text>
          <TextInput
            style={[styles.modalInput, error && styles.modalInputError]}
            value={reason}
            onChangeText={(v) => {
              setReason(v);
              if (v.trim()) setError(false);
            }}
            placeholder="Ex: Créneau indisponible sur votre zone..."
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Raison du refus"
            accessibilityHint="Obligatoire"
          />
          {error && (
            <Text style={styles.inputErrorText} accessibilityRole="alert">
              La raison du refus est obligatoire.
            </Text>
          )}
          <View style={styles.modalActions}>
            <Button title="Annuler" onPress={onCancel} variant="outline" style={{ flex: 1 }} />
            <Button
              title="Confirmer le refus"
              onPress={handleConfirm}
              variant="danger"
              loading={loading}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const orderQuery = useOrder(id ?? "");
  const { data: order, refetch, isRefetching } = orderQuery;
  const state = detailState(orderQuery, !!id);
  const cancel = useCancelOrder();
  const updateStatus = useUpdateOrderStatus();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN";
  const isClient = role === "ROLE_CLIENT";

  const [showRefuseModal, setShowRefuseModal] = useState(false);

  // Injoignable ≠ inexistant : sur mobile, un rafraîchissement qui échoue après
  // une action ne prouve pas que la commande a disparu. On propose de réessayer
  // au lieu d'annoncer une suppression qui n'a pas eu lieu.
  if (state === "unavailable") {
    return (
      <ScreenWrapper>
        <EmptyState
          icon="cloud-offline-outline"
          title="Commande momentanément indisponible"
          description="Impossible de joindre le serveur. Vérifiez votre connexion, la commande n'est pas perdue."
        />
        <Button
          title="Réessayer"
          onPress={() => void refetch()}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          title="Retour"
          onPress={() => router.back()}
          variant="outline"
          style={{ marginTop: spacing.sm }}
        />
      </ScreenWrapper>
    );
  }

  if (state === "missing") {
    return (
      <ScreenWrapper>
        <EmptyState
          icon="cube-outline"
          title="Commande introuvable"
          description="Cette commande n'existe pas ou n'est plus accessible."
        />
        <Button
          title="Retour"
          onPress={() => router.back()}
          variant="outline"
          style={{ marginTop: spacing.lg }}
        />
      </ScreenWrapper>
    );
  }

  if (state === "loading") {
    return (
      <ScreenWrapper>
        <View style={{ gap: spacing.md }}>
          <SkeletonBox height={28} width="60%" />
          <SkeletonBox height={120} />
          <SkeletonBox height={180} />
          <SkeletonBox height={100} />
        </View>
      </ScreenWrapper>
    );
  }

  if (!order) return null;

  const totals = orderTotals(order);

  const canCancel =
    isClient &&
    order.status !== "CANCELLED" &&
    order.status !== "DELIVERED" &&
    new Date(order.deliveryDate).getTime() - Date.now() > 24 * 60 * 60 * 1000;

  const handleClientCancel = () => {
    Alert.alert("Annuler la commande", "Êtes-vous sûr de vouloir annuler cette commande ?", [
      { text: "Non", style: "cancel" },
      {
        text: "Oui, annuler",
        style: "destructive",
        onPress: () => {
          if (cancel.isPending) return;
          cancel.mutate(
            { id: order.id },
            {
              onSuccess: () => router.back(),
              // Le serveur refuse l'annulation à moins de 24 h (CANCEL_TOO_LATE)
              // ou sur un statut incompatible. Sans ce retour, le client croyait
              // la commande annulée alors qu'elle sera livrée et facturée.
              onError: (e) => Alert.alert("Annulation impossible", errorMessage(e)),
            },
          );
        },
      },
    ]);
  };

  const handleAdminConfirm = () => {
    Alert.alert("Confirmer la commande", "Confirmer cette commande ?", [
      { text: "Non", style: "cancel" },
      {
        text: "Confirmer",
        onPress: () => {
          if (updateStatus.isPending) return;
          updateStatus.mutate(
            { id: order.id, status: "CONFIRMED" },
            { onError: (e) => Alert.alert("Mise à jour impossible", errorMessage(e)) },
          );
        },
      },
    ]);
  };

  const handleAdminRefuse = (reason: string) => {
    if (updateStatus.isPending) return;
    updateStatus.mutate(
      { id: order.id, status: "CANCELLED", reason },
      {
        onSuccess: () => setShowRefuseModal(false),
        onError: (e) => Alert.alert("Refus impossible", errorMessage(e)),
      },
    );
  };

  const handleStatusAdvance = (newStatus: string) => {
    const label = newStatus === "IN_DELIVERY" ? "En livraison" : "Livrée";
    Alert.alert("Mettre à jour", `Passer la commande en "${label}" ?`, [
      { text: "Non", style: "cancel" },
      {
        text: "Oui",
        onPress: () => {
          if (updateStatus.isPending) return;
          updateStatus.mutate(
            { id: order.id, status: newStatus },
            { onError: (e) => Alert.alert("Mise à jour impossible", errorMessage(e)) },
          );
        },
      },
    ]);
  };

  return (
    <ScreenWrapper refreshing={isRefetching} onRefresh={refetch}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderNum}>{order.orderNumber}</Text>
          {order.isRecurring && <Badge label="Récurrente" variant="info" />}
        </View>
        <StatusBadge type="order" status={order.status} />
      </View>

      {/* Status timeline */}
      <StatusTimeline currentStatus={order.status} history={order.statusHistory} />

      {/* Delivery info */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Livraison
        </Text>
        <InfoRow label="Date" value={formatDate(order.deliveryDate)} />
        {order.timeSlot && <InfoRow label="Créneau" value={order.timeSlot} />}
        <InfoRow label="Commande le" value={formatDate(order.createdAt)} />
      </Card>

      {/* Client info (admin only) */}
      {isAdmin && order.user && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Client
          </Text>
          <InfoRow label="Nom" value={order.user.name} />
          {/* E-mail facultatif (client créé sur le terrain, sans compte) */}
          <InfoRow label="Email" value={order.user.email ?? "Non renseigné"} />
          {order.user.phone && <InfoRow label="Téléphone" value={order.user.phone} />}
          {order.user.zone && <InfoRow label="Zone" value={order.user.zone.name} />}
        </Card>
      )}

      {/* Items */}
      <Text style={styles.sectionTitleStandalone} accessibilityRole="header">
        Articles commandés
      </Text>
      <Card>
        {(order.items ?? []).map((item, i) => (
          <View key={item.id} style={[styles.itemRow, i > 0 && styles.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.product?.name ?? "Article"}</Text>
              <Text style={styles.itemMeta}>
                {/* `range` est null pour tout le catalogue V2 : sans filtrage on
                    affiche un « · » orphelin en tête de chaque ligne. */}
                {[item.product?.range, `${formatCents(item.unitCents)}/u`]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Text style={styles.itemQty}>{item.quantity}×</Text>
            <Text style={styles.itemTotal}>{formatCents(item.totalCents)}</Text>
          </View>
        ))}
        {/* Sous-total, frais, total : trois lignes distinctes dès que l'API
            communique les frais. Sinon une seule ligne « Total » — afficher
            « Frais : 0,00 € » sur une commande dont on ignore les frais
            annoncerait une gratuité que personne n'a décidée. */}
        {totals.showBreakdown ? (
          <>
            <View style={[styles.itemRow, styles.itemBorder]}>
              <Text style={styles.subTotalLabel}>Sous-total articles</Text>
              <Text style={styles.subTotalValue}>{formatCents(totals.subtotalCents)}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.subTotalLabel}>Frais de livraison</Text>
              {/* « À confirmer » et non « offerte » : hors zone et urgence Flash
                  n'ont aucun tarif public, la colonne vaut 0 sans gratuité.
                  Même vocabulaire que l'e-mail de confirmation. */}
              {totals.deliveryFeeSurDevis ? (
                <Text style={styles.pendingValue}>{DELIVERY_FEE_A_CONFIRMER}</Text>
              ) : totals.deliveryOffered ? (
                <Text style={styles.offeredValue}>Livraison offerte</Text>
              ) : (
                <Text style={styles.subTotalValue}>
                  {formatCents(totals.deliveryFeeCents ?? 0)}
                </Text>
              )}
            </View>
            <View style={[styles.itemRow, styles.itemBorder]}>
              <Text style={styles.totalLabel}>{totals.totalLabel}</Text>
              <Text style={styles.totalValue}>{formatCents(totals.totalCents)}</Text>
            </View>
          </>
        ) : (
          <View style={[styles.itemRow, styles.itemBorder]}>
            <Text style={styles.totalLabel}>{totals.totalLabel}</Text>
            <Text style={styles.totalValue}>{formatCents(totals.totalCents)}</Text>
          </View>
        )}
      </Card>
      {totals.deliveryFeeSurDevis && (
        <Text style={styles.feeSurDevisHint}>
          Les frais de livraison de cette commande sont chiffrés à la main (hors zone ou demande
          urgente) : nous vous communiquons le montant avant la livraison.
        </Text>
      )}

      {/* Notes */}
      {order.specialNotes && (
        <Card style={[styles.section, { marginTop: spacing.md }]}>
          <View style={styles.noteRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.notes}>{order.specialNotes}</Text>
          </View>
        </Card>
      )}

      {/* Cancel reason */}
      {order.cancelledReason && (
        <Card style={[styles.section, { borderColor: colors.error, marginTop: spacing.md }]}>
          <View style={styles.noteRow}>
            <Ionicons name="information-circle-outline" size={18} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cancelReasonLabel}>Motif d'annulation</Text>
              <Text style={styles.cancelReasonText}>{order.cancelledReason}</Text>
            </View>
          </View>
        </Card>
      )}

      {/* Admin actions */}
      {isAdmin && (
        <View style={styles.adminActions}>
          {order.status === "PENDING" && (
            <>
              <Button
                title="Confirmer la commande"
                onPress={handleAdminConfirm}
                loading={updateStatus.isPending}
                style={styles.adminBtn}
              />
              <Button
                title="Refuser"
                onPress={() => setShowRefuseModal(true)}
                variant="danger"
                style={styles.adminBtn}
              />
            </>
          )}
          {order.status === "CONFIRMED" && (
            <Button
              title="Passer en livraison"
              onPress={() => handleStatusAdvance("IN_DELIVERY")}
              loading={updateStatus.isPending}
              variant="secondary"
              style={styles.adminBtn}
            />
          )}
          {order.status === "IN_DELIVERY" && (
            <Button
              title="Marquer comme livrée"
              onPress={() => handleStatusAdvance("DELIVERED")}
              loading={updateStatus.isPending}
              style={styles.adminBtn}
            />
          )}
          {(order.status === "CONFIRMED" ||
            order.status === "IN_DELIVERY" ||
            order.status === "DELIVERED") && (
            <Text style={styles.alreadyTreated} accessibilityRole="text">
              {order.status === "DELIVERED"
                ? "Cette commande a été livrée."
                : "Commande en cours de traitement."}
            </Text>
          )}
        </View>
      )}

      {/* Client cancel */}
      {canCancel && (
        <Button
          title="Annuler cette commande"
          onPress={handleClientCancel}
          variant="danger"
          loading={cancel.isPending}
          style={{ marginTop: spacing.xxl }}
          accessibilityHint="Annulation possible uniquement plus de 24h avant la livraison"
        />
      )}

      {!canCancel && isClient && order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
        <Card
          style={[
            styles.section,
            {
              marginTop: spacing.xl,
              backgroundColor: colors.warningLight,
              borderColor: colors.warning,
            },
          ]}
        >
          <Text style={{ fontSize: font.sizes.sm, color: colors.warningText, textAlign: "center" }}>
            L'annulation n'est plus possible à moins de 24h de la livraison.
          </Text>
        </Card>
      )}

      {/* Refuse modal */}
      <RefuseModal
        visible={showRefuseModal}
        onConfirm={handleAdminRefuse}
        onCancel={() => setShowRefuseModal(false)}
        loading={updateStatus.isPending}
      />
    </ScreenWrapper>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  orderNum: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  // Timeline
  timelineCard: { marginBottom: spacing.md },
  sectionTitle: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionTitleStandalone: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingBottom: spacing.md,
    position: "relative",
  },
  timelineLine: {
    position: "absolute",
    left: 10,
    top: 24,
    width: 2,
    bottom: 0,
    backgroundColor: colors.border,
  },
  timelineLineDone: {
    backgroundColor: colors.primary,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  timelineDotDone: {
    backgroundColor: colors.primary,
  },
  timelineDotActive: {
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  timelineDotError: {
    backgroundColor: colors.error,
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textTertiary,
  },
  timelineContent: { flex: 1, paddingTop: 2 },
  timelineLabel: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.textTertiary,
  },
  timelineLabelActive: {
    color: colors.textPrimary,
    fontWeight: font.weights.bold,
  },
  timelineLabelFuture: {
    color: colors.textTertiary,
  },
  timelineSub: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  cancelledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  // Section cards
  section: { marginBottom: spacing.sm },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  // Items
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  itemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  itemName: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
  },
  itemMeta: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  itemQty: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textSecondary,
    width: 28,
    textAlign: "center",
  },
  itemTotal: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    minWidth: 72,
    textAlign: "right",
  },
  subTotalLabel: {
    flex: 1,
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  subTotalValue: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
  },
  offeredValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.success,
  },
  pendingValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.warningText,
  },
  feeSurDevisHint: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  totalLabel: {
    flex: 1,
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  // Notes
  noteRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  notes: {
    flex: 1,
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  cancelReasonLabel: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.semibold,
    color: colors.error,
    marginBottom: 2,
  },
  cancelReasonText: {
    fontSize: font.sizes.sm,
    color: colors.error,
    lineHeight: 20,
  },
  // Admin actions
  adminActions: {
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  adminBtn: {},
  alreadyTreated: {
    textAlign: "center",
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  inputLabel: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: font.sizes.md,
    color: colors.textPrimary,
    minHeight: 96,
    backgroundColor: colors.background,
    textAlignVertical: "top",
  },
  modalInputError: {
    borderColor: colors.error,
  },
  inputErrorText: {
    fontSize: font.sizes.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  // ScrollView override (used in modal)
  scrollView: { flex: 1 },
});
