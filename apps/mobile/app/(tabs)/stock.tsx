import { useState, useCallback, memo } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Card } from "@/components/Card";
import { DonutChart } from "@/components/DonutChart";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonBox } from "@/components/SkeletonBox";
import { EmptyState } from "@/components/EmptyState";
import { useMyStock, useOrders, formatDateShort, formatCents } from "@/lib/api";
import type { ClientStock, StockMovement } from "@/lib/api";
import { colors, font, spacing, radius } from "@/lib/theme";

// ─── Constants ───────────────────────────────────────────────────

const RANGE_LABELS: Record<string, string> = {
  // Gammes historiques
  CONFORT: "Confort",
  HOTEL: "Hotel",
  PRESTIGE: "Prestige",
  // Nouvelles gammes kits (ADR-V2-001 / ADR-V2-004)
  KIT_BAIN: "Kit Bain",
  KIT_LIT: "Kit Lit",
  KIT_COMPLET: "Kit Complet",
};

const RANGE_COLORS: Record<string, string> = {
  CONFORT: "#06b6d4",
  HOTEL: "#6366f1",
  PRESTIGE: "#f59e0b",
  // Couleurs pour les kits
  KIT_BAIN: "#1B5E20",
  KIT_LIT: "#7B6FA6",
  KIT_COMPLET: "#10b981",
};

const MOVEMENT_INFO: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  DELIVERY: { label: "Livraison", icon: "car-outline", color: colors.success },
  PICKUP_DIRTY: { label: "Ramassage", icon: "refresh-outline", color: colors.warning },
  WASH_COMPLETE: { label: "Lavage", icon: "sparkles-outline", color: colors.info },
  ADJUSTMENT: { label: "Ajustement", icon: "construct-outline", color: colors.textTertiary },
  RETIREMENT: { label: "Retrait", icon: "archive-outline", color: colors.error },
};

const PERIOD_LABELS = ["Ce mois", "3 mois"] as const;
type Period = (typeof PERIOD_LABELS)[number];

// ─── StockDonut ───────────────────────────────────────────────────

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

      {/* Big numbers row */}
      <View style={styles.bigNumsRow}>
        <View style={styles.bigNum}>
          <Text style={[styles.bigNumValue, { color: colors.success }]}>{stock.cleanSets}</Text>
          <Text style={styles.bigNumLabel}>Propres</Text>
        </View>
        <View style={styles.bigNum}>
          <Text style={[styles.bigNumValue, { color: colors.warning }]}>{stock.dirtySets}</Text>
          <Text style={styles.bigNumLabel}>Sales</Text>
        </View>
        <View style={styles.bigNum}>
          <Text style={[styles.bigNumValue, { color: colors.circulation }]}>{inTransit}</Text>
          <Text style={styles.bigNumLabel}>En transit</Text>
        </View>
      </View>

      <DonutChart
        segments={[
          { value: stock.cleanSets, color: colors.clean, label: "Propres" },
          { value: stock.dirtySets, color: colors.dirty, label: "Sales" },
          { value: inTransit, color: colors.circulation, label: "En transit" },
        ]}
        centerValue={String(stock.cleanSets)}
        centerLabel="propres"
        size={130}
      />
    </Card>
  );
}

// ─── MovementItem ─────────────────────────────────────────────────

const MovementItem = memo(function MovementItem({
  m,
  isLast,
  index,
}: {
  m: StockMovement;
  isLast: boolean;
  index: number;
}) {
  const info = MOVEMENT_INFO[m.type] ?? {
    label: m.type,
    icon: "information-circle-outline" as const,
    color: colors.textTertiary,
  };
  const isPositive = m.quantity > 0;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 35)}>
      <View style={[styles.movRow, !isLast && styles.movBorder]}>
        <View style={[styles.movIcon, { backgroundColor: info.color + "15" }]}>
          <Ionicons name={info.icon} size={20} color={info.color} />
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
    </Animated.View>
  );
});

// ─── Activity section ─────────────────────────────────────────────

function ActivitySection() {
  const [period, setPeriod] = useState<Period>("Ce mois");
  const { data: ordersData } = useOrders("DELIVERED");

  const now = new Date();
  const cutoff = new Date(now);
  if (period === "Ce mois") {
    cutoff.setMonth(now.getMonth() - 1);
  } else {
    cutoff.setMonth(now.getMonth() - 3);
  }

  const periodOrders =
    ordersData?.filter((o) => o.status === "DELIVERED" && new Date(o.deliveryDate) >= cutoff) ?? [];

  const totalCommandé = periodOrders.reduce((s, o) => s + o.totalCents, 0);
  const nbCommandes = periodOrders.length;

  return (
    <View>
      <SectionHeader title="Mon activité" />
      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIOD_LABELS.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={[styles.periodChip, period === p && styles.periodChipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p }}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.activityRow}>
        <Card style={styles.activityCard}>
          <Ionicons name="receipt-outline" size={24} color={colors.primary} />
          <Text style={styles.activityValue}>{nbCommandes}</Text>
          <Text style={styles.activityLabel}>
            Commande{nbCommandes > 1 ? "s" : ""} livrée{nbCommandes > 1 ? "s" : ""}
          </Text>
        </Card>
        <Card style={styles.activityCard}>
          <Ionicons name="cash-outline" size={24} color={colors.success} />
          <Text style={[styles.activityValue, { color: colors.success }]}>
            {formatCents(totalCommandé)}
          </Text>
          <Text style={styles.activityLabel}>Total consommé</Text>
        </Card>
      </View>
    </View>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────

function StockSkeleton() {
  return (
    <ScreenWrapper>
      <SkeletonBox height={200} style={{ marginBottom: spacing.md }} />
      <SkeletonBox height={140} style={{ marginBottom: spacing.md }} />
      <SkeletonBox height={160} />
    </ScreenWrapper>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function StockScreen() {
  const { data, isLoading, refetch, isRefetching } = useMyStock();

  // Hook déclaré AVANT tout return conditionnel (Rules of Hooks) — sinon le
  // nombre de hooks change entre le rendu loading et le rendu data → crash
  // « Rendered more hooks than during the previous render ».
  const movementsCount = data?.recentMovements.length ?? 0;
  const renderMovement = useCallback(
    ({ item, index }: { item: StockMovement; index: number }) => (
      <MovementItem m={item} isLast={index === movementsCount - 1} index={index} />
    ),
    [movementsCount],
  );

  if (isLoading) return <StockSkeleton />;

  if (!data?.stocks.length) {
    return (
      <ScreenWrapper>
        <EmptyState
          icon="stats-chart-outline"
          title="Pas de stock"
          description="Votre stock apparaîtra ici après votre première livraison."
        />
      </ScreenWrapper>
    );
  }

  const totalClean = data.stocks.reduce((s, st) => s + st.cleanSets, 0);
  const totalDirty = data.stocks.reduce((s, st) => s + st.dirtySets, 0);
  const totalCirculation = data.stocks.reduce((s, st) => s + st.totalInCirculation, 0);

  return (
    <ScreenWrapper refreshing={isRefetching} onRefresh={refetch}>
      {/* Global overview */}
      <Card style={styles.overviewCard}>
        <Text style={styles.overviewTitle} accessibilityRole="header">
          Vue d'ensemble
        </Text>
        {/* Big numbers */}
        <View style={styles.overviewNums}>
          <View style={styles.bigNum}>
            <Text style={[styles.bigNumValue, { color: colors.success }]}>{totalClean}</Text>
            <Text style={styles.bigNumLabel}>Propres</Text>
          </View>
          <View style={[styles.bigNum, styles.bigNumCenter]}>
            <Text
              style={[styles.bigNumValue, { fontSize: font.sizes.xxxl, color: colors.textPrimary }]}
            >
              {totalCirculation}
            </Text>
            <Text style={[styles.bigNumLabel, { color: colors.textSecondary }]}>
              En circulation
            </Text>
          </View>
          <View style={styles.bigNum}>
            <Text style={[styles.bigNumValue, { color: colors.warning }]}>{totalDirty}</Text>
            <Text style={styles.bigNumLabel}>Sales</Text>
          </View>
        </View>

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
          size={170}
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

      {/* Activity section */}
      <ActivitySection />

      {/* Recent movements */}
      <SectionHeader title="Historique des mouvements" />
      {data.recentMovements.length === 0 ? (
        <Card>
          <Text style={styles.emptyMov}>Aucun mouvement récent</Text>
        </Card>
      ) : (
        <Card padded={false}>
          <FlatList
            data={data.recentMovements}
            keyExtractor={(m) => m.id}
            renderItem={renderMovement}
            scrollEnabled={false}
          />
        </Card>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  overviewCard: {
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  overviewTitle: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  overviewNums: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.lg,
  },
  bigNumsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  bigNum: {
    alignItems: "center",
  },
  bigNumCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
  },
  bigNumValue: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
  },
  bigNumLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  donutCard: { marginBottom: spacing.md },
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
  // Activity
  periodRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: "center",
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.medium,
    color: colors.textSecondary,
  },
  periodTextActive: { color: colors.textInverse },
  activityRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  activityCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  activityValue: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
  },
  activityLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
