import { View, Text, StyleSheet } from "react-native";
import { colors, radius, font, spacing } from "@/lib/theme";

type Variant = "default" | "success" | "warning" | "error" | "info";

interface Props {
  label: string;
  variant?: Variant;
  /** Show a leading status dot (useful on list cards). */
  dot?: boolean;
}

const variantColors: Record<Variant, { bg: string; text: string; dot: string }> = {
  default: { bg: colors.borderLight, text: colors.textSecondary, dot: colors.textTertiary },
  success: { bg: colors.successLight, text: colors.successText, dot: colors.success },
  warning: { bg: colors.warningLight, text: colors.warningText, dot: colors.warning },
  error: { bg: colors.errorLight, text: colors.errorText, dot: colors.error },
  info: { bg: colors.infoLight, text: colors.infoText, dot: colors.info },
};

export function Badge({ label, variant = "default", dot = false }: Props) {
  const c = variantColors[variant];
  return (
    <View
      style={[styles.badge, { backgroundColor: c.bg }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {dot && <View style={[styles.dot, { backgroundColor: c.dot }]} />}
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.semibold,
  },
});
