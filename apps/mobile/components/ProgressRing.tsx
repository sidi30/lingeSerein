import { View, Text, StyleSheet } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { colors, font } from "@/lib/theme";

interface Props {
  completed: number;
  total: number;
  size?: number;
  label?: string;
  color?: string;
}

export function ProgressRing({
  completed,
  total,
  size = 100,
  label,
  color = colors.primary,
}: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remaining = total - completed;

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={`${completed} sur ${total} ${label ?? ""}`}
      accessibilityValue={{ min: 0, max: total, now: completed }}
    >
      <PieChart
        data={[
          { value: completed || 0.01, color },
          { value: remaining || 0.01, color: colors.borderLight },
        ]}
        donut
        radius={size / 2}
        innerRadius={size / 2 - 12}
        innerCircleColor={colors.surface}
        centerLabelComponent={() => (
          <View style={styles.center}>
            <Text style={[styles.pct, { color }]}>{pct}%</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  pct: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.heavy,
  },
});
