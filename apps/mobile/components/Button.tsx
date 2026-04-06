import { Pressable, Text, ActivityIndicator, StyleSheet, type ViewStyle } from "react-native";
import { colors, radius, font, spacing, MIN_HIT_TARGET } from "@/lib/theme";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

const variantStyles: Record<
  Variant,
  { bg: string; bgPressed: string; text: string; border?: string }
> = {
  primary: { bg: colors.primary, bgPressed: colors.primaryDark, text: colors.textInverse },
  secondary: { bg: colors.primaryLight, bgPressed: "#c7d2fe", text: colors.primary },
  outline: {
    bg: "transparent",
    bgPressed: colors.primaryLight,
    text: colors.primary,
    border: colors.primary,
  },
  danger: { bg: colors.error, bgPressed: "#b91c1c", text: colors.textInverse },
  ghost: { bg: "transparent", bgPressed: colors.borderLight, text: colors.textSecondary },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  accessibilityHint,
}: Props) {
  const v = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? v.bgPressed : v.bg,
          borderColor: v.border ?? "transparent",
          borderWidth: v.border ? 1.5 : 0,
          opacity: isDisabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <Text style={[styles.text, { color: v.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_HIT_TARGET + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  text: {
    fontSize: font.sizes.md,
    fontWeight: font.weights.bold,
  },
});
