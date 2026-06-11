import { View, Text, Pressable, StyleSheet, Linking, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { StatusBadge } from "@/components/StatusBadge";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { SectionHeader } from "@/components/SectionHeader";
import { useClient, formatCents, formatDate } from "@/lib/api";
import { colors, font, spacing, radius } from "@/lib/theme";

const ACCOMMODATION_LABELS: Record<string, string> = {
  HOTEL: "Hotel",
  GITE: "Gite",
  AIRBNB: "Airbnb",
  AUBERGE: "Auberge",
  AUTRE: "Autre",
};

function ClientDetailSkeleton() {
  return (
    <ScreenWrapper>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl }}>
          <SkeletonBox width={72} height={72} borderRadius={36} />
          <SkeletonBox width={150} height={24} />
          <SkeletonBox width={200} height={16} />
        </View>
        <SkeletonBox height={100} />
        <SkeletonBox height={80} />
        <SkeletonBox height={160} />
      </View>
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

export default function ClientDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data: client, isLoading, isError, refetch, isRefetching } = useClient(id ?? "");

  if (!id || isError || (!isLoading && !client)) {
    return (
      <ScreenWrapper>
        <EmptyState
          icon="person-outline"
          title="Client introuvable"
          description="Ce client n'existe pas ou vous n'avez pas acces a cette fiche."
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

  if (isLoading) return <ClientDetailSkeleton />;
  if (!client) return null;

  const initials = client.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Aggregate stock totals from ClientStock array
  const totalInCirc = client.stocks.reduce((acc, s) => acc + s.totalInCirculation, 0);
  const cleanSets = client.stocks.reduce((acc, s) => acc + s.cleanSets, 0);
  const dirtySets = client.stocks.reduce((acc, s) => acc + s.dirtySets, 0);

  const handleCall = () => {
    if (!client.phone) return;
    void (async () => {
      try {
        await Linking.openURL(`tel:${client.phone}`);
      } catch {
        Alert.alert("Erreur", "Impossible d'ouvrir l'application Téléphone.");
      }
    })();
  };

  return (
    <ScreenWrapper refreshing={isRefetching} onRefresh={refetch}>
      {/* Profile header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{client.name}</Text>
        <Text style={styles.email}>{client.email}</Text>
        <View style={styles.headerBadges}>
          {client.accommodationType && (
            <Badge
              label={ACCOMMODATION_LABELS[client.accommodationType] ?? client.accommodationType}
            />
          )}
          {client.isActive === false && <Badge label="Inactif" variant="error" />}
        </View>

        {/* Contact */}
        {client.phone && (
          <Pressable
            onPress={handleCall}
            style={styles.callBtn}
            accessibilityRole="button"
            accessibilityLabel={`Appeler ${client.name}`}
            accessibilityHint="Ouvre le composeur telephonique"
          >
            <Ionicons name="call-outline" size={18} color={colors.primary} />
            <Text style={styles.callBtnText}>{client.phone}</Text>
          </Pressable>
        )}
      </View>

      {/* Stock summary from ClientStock[] */}
      {client.stocks.length > 0 && (
        <>
          <SectionHeader title="Stock actuel" />
          <View style={styles.stockRow}>
            <Card style={styles.stockCard}>
              <Text style={[styles.stockNum, { color: colors.success }]}>{cleanSets}</Text>
              <Text style={styles.stockLabel}>Propres</Text>
            </Card>
            <Card style={styles.stockCard}>
              <Text style={[styles.stockNum, { color: colors.warning }]}>{dirtySets}</Text>
              <Text style={styles.stockLabel}>Sales</Text>
            </Card>
            <Card style={styles.stockCard}>
              <Text style={[styles.stockNum, { color: colors.circulation }]}>{totalInCirc}</Text>
              <Text style={styles.stockLabel}>Circulation</Text>
            </Card>
          </View>

          {/* Per-range breakdown */}
          {client.stocks.map((s) => (
            <Animated.View key={s.productRange} entering={FadeInDown.springify()}>
              <Card style={styles.rangeCard}>
                <Text style={styles.rangeTitle}>{s.productRange}</Text>
                <View style={styles.rangeNums}>
                  <View style={styles.rangeNumItem}>
                    <Text style={[styles.rangeNum, { color: colors.success }]}>{s.cleanSets}</Text>
                    <Text style={styles.rangeNumLabel}>Propres</Text>
                  </View>
                  <View style={styles.rangeNumItem}>
                    <Text style={[styles.rangeNum, { color: colors.warning }]}>{s.dirtySets}</Text>
                    <Text style={styles.rangeNumLabel}>Sales</Text>
                  </View>
                  <View style={styles.rangeNumItem}>
                    <Text style={[styles.rangeNum, { color: colors.primary }]}>
                      {s.totalInCirculation}
                    </Text>
                    <Text style={styles.rangeNumLabel}>Circulation</Text>
                  </View>
                </View>
              </Card>
            </Animated.View>
          ))}
        </>
      )}

      {/* Account info */}
      <Card style={styles.infoCard}>
        <InfoRow label="Membre depuis" value={formatDate(client.createdAt)} />
        <InfoRow label="Creneau prefere" value={client.preferredTimeSlot ?? "Non defini"} />
        <InfoRow label="Seuil d'alerte" value={`${client.stockAlertThreshold ?? 30}%`} />
        {client.address && <InfoRow label="Adresse" value={client.address} />}
        {client.notes && <InfoRow label="Notes" value={client.notes} />}
      </Card>

      {/* Subscription (single) */}
      {client.subscription && (
        <>
          <SectionHeader title="Abonnement" />
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.subCard}>
              <View style={styles.subRow}>
                <Text style={styles.subPlan}>{client.subscription.plan ?? "Plan inconnu"}</Text>
                <StatusBadge type="subscription" status={client.subscription.status} />
              </View>
              {client.subscription.products.length > 0 && (
                <View style={styles.subProducts}>
                  {client.subscription.products.map((sp) => (
                    <Text key={sp.id} style={styles.subProduct}>
                      {sp.quantity}x {sp.product.name}{" "}
                      <Text style={styles.subProductPrice}>
                        ({formatCents(sp.product.priceCents)})
                      </Text>
                    </Text>
                  ))}
                </View>
              )}
            </Card>
          </Animated.View>
        </>
      )}

      {/* Recent orders (orders, not recentOrders) */}
      {client.orders && client.orders.length > 0 && (
        <>
          <SectionHeader title="Commandes recentes" />
          {client.orders.slice(0, 5).map((order, i) => (
            <Animated.View key={order.id} entering={FadeInDown.delay(i * 40)}>
              <Pressable
                onPress={() => router.push(`/(tabs)/orders/${order.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Commande ${order.orderNumber}`}
              >
                <Card style={styles.orderCard}>
                  <View style={styles.orderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderNum}>{order.orderNumber}</Text>
                      <Text style={styles.orderDate}>{formatDate(order.deliveryDate)}</Text>
                    </View>
                    <StatusBadge type="order" status={order.status} />
                    <Text style={styles.orderTotal}>{formatCents(order.totalCents)}</Text>
                  </View>
                </Card>
              </Pressable>
            </Animated.View>
          ))}
        </>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  avatarText: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.bold,
    color: colors.primary,
  },
  name: {
    fontSize: font.sizes.xl,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  email: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  headerBadges: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    minHeight: 44,
  },
  callBtnText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
  },
  // Stock
  stockRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stockCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  stockNum: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
  },
  stockLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  // Range breakdown
  rangeCard: { marginBottom: spacing.sm },
  rangeTitle: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  rangeNums: { flexDirection: "row", justifyContent: "space-around" },
  rangeNumItem: { alignItems: "center" },
  rangeNum: { fontSize: font.sizes.xl, fontWeight: font.weights.bold },
  rangeNumLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  // Info card
  infoCard: { marginBottom: spacing.md },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  infoLabel: { fontSize: font.sizes.sm, color: colors.textSecondary },
  infoValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  // Subscription
  subCard: { marginBottom: spacing.md },
  subRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  subPlan: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  subProducts: { gap: spacing.xs },
  subProduct: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  subProductPrice: {
    color: colors.textTertiary,
    fontSize: font.sizes.xs,
  },
  // Orders
  orderCard: { marginBottom: spacing.sm },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  orderNum: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
  },
  orderDate: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  orderTotal: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
});
