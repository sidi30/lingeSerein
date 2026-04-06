import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, font, spacing, MIN_HIT_TARGET } from "@/lib/theme";

interface Props {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    marginTop: spacing.xl,
    minHeight: MIN_HIT_TARGET,
  },
  title: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.bold,
    color: colors.textPrimary,
  },
  action: {
    minHeight: MIN_HIT_TARGET,
    justifyContent: "center",
  },
  actionText: {
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
    color: colors.primary,
  },
});
