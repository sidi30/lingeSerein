import { View, Text, StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, font, spacing } from "@/lib/theme";

interface Props {
  steps: string[];
  current: number; // 0-based
}

export function StepIndicator({ steps, current }: Props) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Animated.View key={step} entering={FadeIn.delay(i * 50)} style={styles.step}>
            {/* connector left */}
            {i > 0 && <View style={[styles.connector, done && styles.connectorDone]} />}
            <View
              style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}
              accessibilityLabel={`Étape ${i + 1}: ${step}${done ? " (terminée)" : active ? " (en cours)" : ""}`}
            >
              {done ? (
                <Text style={styles.dotCheckmark}>✓</Text>
              ) : (
                <Text style={[styles.dotText, active && styles.dotTextActive]}>{i + 1}</Text>
              )}
            </View>
            <Text
              style={[styles.label, done && styles.labelDone, active && styles.labelActive]}
              numberOfLines={1}
            >
              {step}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  step: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  connector: {
    position: "absolute",
    top: 14,
    left: "-50%",
    right: "50%",
    height: 2,
    backgroundColor: colors.border,
  },
  connectorDone: {
    backgroundColor: colors.primary,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  dotDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  dotText: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.bold,
    color: colors.textTertiary,
  },
  dotTextActive: {
    color: colors.primary,
  },
  dotCheckmark: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.bold,
    color: colors.textInverse,
  },
  label: {
    fontSize: 10,
    color: colors.textTertiary,
    textAlign: "center",
  },
  labelDone: {
    color: colors.primary,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: font.weights.semibold,
  },
});
