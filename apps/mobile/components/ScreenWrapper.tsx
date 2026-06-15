import { ScrollView, RefreshControl, StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { colors, spacing, TAB_BAR_BASE_HEIGHT } from "@/lib/theme";

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  /**
   * Safe-area edges to apply. Default omits "top" because most screens sit
   * under a native navigation header. Pass `["top","left","right"]` on screens
   * with `headerShown:false` that render their own header.
   */
  edges?: Edge[];
  /**
   * Reserve space at the bottom so content clears the tab bar + home indicator.
   * Set false on pushed detail screens that hide the tab bar.
   */
  withTabBar?: boolean;
}

export function ScreenWrapper({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  style,
  contentStyle,
  edges = ["left", "right"],
  withTabBar = true,
}: Props) {
  const insets = useSafeAreaInsets();
  // Tab bar already accounts for insets.bottom, so don't double-count it here.
  const bottomPad =
    (withTabBar ? TAB_BAR_BASE_HEIGHT + insets.bottom : insets.bottom) + spacing.xxl;

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.safe, style]} edges={edges}>
        <View style={[styles.flex, { paddingBottom: bottomPad }]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, contentStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
});
