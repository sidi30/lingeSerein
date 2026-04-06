import { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useOrder, useCancelOrder, formatCents, formatDate } from "@/lib/api";
import { colors, font, spacing } from "@/lib/theme";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading } = useOrder(id ?? "");
  const cancel = useCancelOrder();
  const [cancelling, setCancelling] = useState(false);

  if (isLoading || !order) return <LoadingScreen />;

  const canCancel =
    order.status !== "CANCELLED" &&
    order.status !== "DELIVERED" &&
    new Date(order.deliveryDate).getTime() - Date.now() > 24 * 60 * 60 * 1000;

  const handleCancel = () => {
    Alert.alert("Annuler la commande", "Etes-vous sur de vouloir annuler cette commande ?", [
      { text: "Non", style: "cancel" },
      {
        text: "Oui, annuler",
        style: "destructive",
        onPress: () => {
          setCancelling(true);
          cancel.mutate(
            { id: order.id },
            {
              onSuccess: () => router.back(),
              onSettled: () => setCancelling(false),
            },
          );
        },
      },
    ]);
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.orderNum}>{order.orderNumber}</Text>
        <StatusBadge type="order" status={order.status} />
      </View>

      {/* Info card */}
      <Card style={styles.section}>
        <InfoRow label="Date de livraison" value={formatDate(order.deliveryDate)} />
        {order.timeSlot && <InfoRow label="Creneau" value={order.timeSlot} />}
        <InfoRow label="Commande passee le" value={formatDate(order.createdAt)} />
        {order.isRecurring && <Badge label="Recurrente" variant="info" />}
      </Card>

      {/* Items */}
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Articles
      </Text>
      <Card>
        {order.items.map((item, i) => (
          <View key={item.id} style={[styles.itemRow, i > 0 && styles.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.product.name}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity} x {formatCents(item.unitCents)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatCents(item.totalCents)}</Text>
          </View>
        ))}
        <View style={[styles.itemRow, styles.itemBorder]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCents(order.totalCents)}</Text>
        </View>
      </Card>

      {/* Notes */}
      {order.specialNotes && (
        <>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Card>
            <Text style={styles.notes}>{order.specialNotes}</Text>
          </Card>
        </>
      )}

      {/* Cancel reason */}
      {order.cancelledReason && (
        <>
          <Text style={styles.sectionTitle}>Raison d'annulation</Text>
          <Card style={{ borderColor: colors.error }}>
            <Text style={styles.notes}>{order.cancelledReason}</Text>
          </Card>
        </>
      )}

      {/* Cancel button */}
      {canCancel && (
        <Button
          title="Annuler cette commande"
          onPress={handleCancel}
          variant="danger"
          loading={cancelling}
          style={{ marginTop: spacing.xxl }}
          accessibilityHint="Annuler la commande. Possible uniquement plus de 24h avant la livraison."
        />
      )}
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
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  orderNum: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  section: { marginBottom: spacing.md },
  sectionTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  infoLabel: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
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
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  totalLabel: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  notes: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
