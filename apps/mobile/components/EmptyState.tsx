import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, spacing } from "@/lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  /** Ionicons icon name (e.g. "cube-outline") */
  icon: IoniconName;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: Props) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={48} color={colors.textTertiary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxxl,
  },
  iconWrap: {
    marginBottom: spacing.lg,
    opacity: 0.5,
  },
  title: {
    fontSize: font.sizes.lg,
    fontWeight: font.weights.semibold,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: font.sizes.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
