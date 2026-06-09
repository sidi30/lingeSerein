import { View, Text, StyleSheet } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { colors, font, spacing } from "@/lib/theme";

interface Segment {
  value: number;
  color: string;
  label: string;
}

interface Props {
  segments: Segment[];
  centerLabel: string;
  centerValue: string;
  size?: number;
}

export function DonutChart({ segments, centerLabel, centerValue, size = 160 }: Props) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const pieData = segments.map((seg) => ({
    value: seg.value || 0.1,
    color: seg.color,
    text: "",
  }));

  return (
    <View
      style={styles.container}
      accessibilityRole="image"
      accessibilityLabel={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
    >
      <PieChart
        data={pieData}
        donut
        radius={size / 2}
        innerRadius={size / 2 - 18}
        innerCircleColor={colors.surface}
        centerLabelComponent={() => (
          <View style={styles.center}>
            <Text style={styles.centerValue}>{centerValue}</Text>
            <Text style={styles.centerLabel}>{centerLabel}</Text>
          </View>
        )}
      />
      <View style={styles.legend}>
        {segments.map((seg) => (
          <View key={seg.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
            <Text style={styles.legendText}>{seg.label}</Text>
            <Text style={styles.legendValue}>{seg.value}</Text>
            {total > 0 && (
              <Text style={styles.legendPct}>{Math.round((seg.value / total) * 100)}%</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerValue: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
    color: colors.textPrimary,
  },
  centerLabel: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
  },
  legendValue: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  legendPct: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
  },
});
