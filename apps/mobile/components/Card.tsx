import { View, StyleSheet, type ViewStyle, type ViewProps } from "react-native";
import { colors, radius, spacing, shadow } from "@/lib/theme";

interface Props extends ViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export function Card({ children, style, padded = true, ...rest }: Props) {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  padded: {
    padding: spacing.lg,
  },
});
