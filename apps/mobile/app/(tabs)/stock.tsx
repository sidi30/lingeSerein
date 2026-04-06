import { View, Text, StyleSheet } from "react-native";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { DonutChart } from "@/components/DonutChart";
import { SectionHeader } from "@/components/SectionHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import { EmptyState } from "@/components/EmptyState";
import { useMyStock, useIsClient, formatDateShort } from "@/lib/api";
import type { ClientStock, StockMovement } from "@/lib/api";
import { colors, font, spacing, radius } from "@/lib/theme";

const RANGE_LABELS: Record<string, string> = {
  CONFORT: "Confort",
  HOTEL: "Hotel",
  PRESTIGE: "Prestige",
};

const RANGE_COLORS: Record<string, string> = {
  CONFORT: "#06b6d4",
  HOTEL: "#6366f1",
  PRESTIGE: "#f59e0b",
};

const MOVEMENT_INFO: Record<string, { label: string; icon: string; color: string }> = {
  DELIVERY: { label: "Livraison", icon: "\ud83d\ude9a", color: colors.success },
  PICKUP_DIRTY: { label: "Ramassage", icon: "\ud83e\uddf9", color: colors.warning },
  WASH_COMPLETE: { label: "Lavage", icon: "\u2728", color: colors.info },
  ADJUSTMENT: { label: "Ajustement", icon: "\ud83d\udd27", color: colors.textTertiary },
  RETIREMENT: { label: "Retrait", icon: "\u274c", color: colors.error },
};

function StockDonut({ stock }: { stock: ClientStock }) {
  const total = stock.totalInCirculation;
  const inTransit = Math.max(total - stock.cleanSets - stock.dirtySets, 0);
  const rangeColor = RANGE_COLORS[stock.productRange] ?? colors.primary;

  return (
    <Card style={styles.donutCard}>
      <View style={styles.donutHeader}>
        <View style={[styles.rangeBadge, { backgroundColor: rangeColor + "18" }]}>
          <Text style={[styles.rangeBadgeText, { color: rangeColor }]}>
            {RANGE_LABELS[stock.productRange] ?? stock.productRange}
          </Text>
        </View>
        <Text style={styles.totalLabel}>{total} sets</Text>
      </View>

      <DonutChart
        segments={[
          { value: stock.cleanSets, color: colors.clean, label: "Propres" },
          { value: stock.dirtySets, color: colors.dirty, label: "Sales" },
          { value: inTransit, color: colors.circulation, label: "En transit" },
        ]}
        centerValue={String(stock.cleanSets)}
        centerLabel="propres"
        size={140}
      />
    </Card>
  );
}

function MovementItem({ m, isLast }: { m: StockMovement; isLast: boolean }) {
  const info = MOVEMENT_INFO[m.type] ?? {
    label: m.type,
    icon: "\u2139\ufe0f",
    color: colors.textTertiary,
  };
  const isPositive = m.quantity > 0;

  return (
    <View style={[styles.movRow, !isLast && styles.movBorder]}>
      <View style={[styles.movIcon, { backgroundColor: info.color + "15" }]}>
        <Text style={{ fontSize: 16 }}>{info.icon}</Text>
      </View>
      <View style={styles.movContent}>
        <Text style={styles.movLabel}>{info.label}</Text>
        <Text style={styles.movMeta}>
          {RANGE_LABELS[m.productRange] ?? m.productRange} · {formatDateShort(m.createdAt)}
        </Text>
      </View>
      <View
        style={[
          styles.movQtyBadge,
          { backgroundColor: isPositive ? colors.successLight : colors.warningLight },
        ]}
      >
        <Text style={[styles.movQty, { color: isPositive ? colors.success : colors.warning }]}>
          {isPositive ? "+" : ""}
          {m.quantity}
        </Text>
      </View>
    </View>
  );
}

export default function StockScreen() {
  const { data, isLoading, refetch, isRefetching } = useMyStock();

  if (isLoading) return <LoadingScreen />;

  if (!data?.stocks.length) {
    return (
      <EmptyState
        icon={"\ud83d\udcca"}
        title="Pas de stock"
        description="Votre stock apparaitra ici apres votre premiere livraison"
      />
    );
  }

  // Global summary
  const totalClean = data.stocks.reduce((s, st) => s + st.cleanSets, 0);
  const totalDirty = data.stocks.reduce((s, st) => s + st.dirtySets, 0);
  const totalCirculation = data.stocks.reduce((s, st) => s + st.totalInCirculation, 0);

  return (
    <ScreenWrapper refreshing={isRefetching} onRefresh={refetch}>
      {/* Global overview donut */}
      <Card style={styles.overviewCard}>
        <Text style={styles.overviewTitle} accessibilityRole="header">
          Vue d'ensemble
        </Text>
        <DonutChart
          segments={[
            { value: totalClean, color: colors.clean, label: "Propres" },
            { value: totalDirty, color: colors.dirty, label: "Sales" },
            {
              value: Math.max(totalCirculation - totalClean - totalDirty, 0),
              color: colors.circulation,
              label: "En transit",
            },
          ]}
          centerValue={String(totalCirculation)}
          centerLabel="en circulation"
          size={180}
        />
      </Card>

      {/* Per-range breakdown */}
      {data.stocks.length > 1 && (
        <>
          <SectionHeader title="Par gamme" />
          {data.stocks.map((stock) => (
            <StockDonut key={stock.productRange} stock={stock} />
          ))}
        </>
      )}

      {/* Recent movements */}
      <SectionHeader title="Derniers mouvements" />
      {data.recentMovements.length === 0 ? (
        <Card>
          <Text style={styles.emptyMov}>Aucun mouvement recent</Text>
        </Card>
      ) : (
        <Card padded={false}>
          {data.recentMovements.slice(0, 15).map((m, i) => (
            <MovementItem
              key={m.id}
              m={m}
              isLast={i === Math.min(data.recentMovements.length, 15) - 1}
            />
          ))}
        </Card>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  overviewCard: {
    paddingVertical: spacing.xl,
  },
  overviewTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  donutCard: {
    marginBottom: spacing.md,
  },
  donutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  rangeBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  rangeBadgeText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
  },
  totalLabel: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
    fontWeight: font.weights.medium,
  },
  // Movements
  movRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  movBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  movIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  movContent: { flex: 1 },
  movLabel: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.medium,
    color: colors.textPrimary,
  },
  movMeta: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  movQtyBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  movQty: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
  },
  emptyMov: {
    fontSize: font.sizes.sm,
    color: colors.textTertiary,
    textAlign: "center",
    padding: spacing.xxl,
  },
});
