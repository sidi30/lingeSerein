import { View, Text, StyleSheet } from "react-native";
import { Card } from "./Card";
import { colors, font, spacing } from "@/lib/theme";

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: string;
}

export function StatCard({ label, value, sub, color = colors.primary, icon }: Props) {
  return (
    <Card style={styles.card}>
      <View style={[styles.iconContainer, { backgroundColor: color + "15" }]}>
        <Text style={styles.icon}>{icon ?? "\u2022"}</Text>
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub && <Text style={styles.sub}>{sub}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  icon: {
    fontSize: 16,
  },
  value: {
    fontSize: font.sizes.xxl,
    fontWeight: font.weights.heavy,
  },
  label: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sub: {
    fontSize: font.sizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
    textAlign: "center",
  },
});
