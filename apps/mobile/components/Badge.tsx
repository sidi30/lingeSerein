import { View, Text, StyleSheet } from "react-native";
import { colors, radius, font, spacing } from "@/lib/theme";

type Variant = "default" | "success" | "warning" | "error" | "info";

interface Props {
  label: string;
  variant?: Variant;
}

const variantColors: Record<Variant, { bg: string; text: string }> = {
  default: { bg: colors.borderLight, text: colors.textSecondary },
  success: { bg: colors.successLight, text: colors.success },
  warning: { bg: colors.warningLight, text: colors.warning },
  error: { bg: colors.errorLight, text: colors.error },
  info: { bg: colors.infoLight, text: colors.info },
};

export function Badge({ label, variant = "default" }: Props) {
  const c = variantColors[variant];
  return (
    <View
      style={[styles.badge, { backgroundColor: c.bg }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.semibold,
  },
});
