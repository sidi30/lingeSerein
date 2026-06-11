import { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { colors, radius } from "@/lib/theme";

interface Props {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
  borderRadius?: number;
}

export function SkeletonBox({
  width = "100%",
  height = 16,
  style,
  borderRadius = radius.sm,
}: Props) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.skeleton, { width, height, borderRadius }, animatedStyle, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Chargement"
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.borderLight,
  },
});
