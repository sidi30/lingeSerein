/**
 * Linge Serein Design Tokens
 * WCAG AA compliant color contrasts
 */

import { Platform, type ViewStyle } from "react-native";

export const colors = {
  // Primary brand – forest green
  primary: "#1B5E20",
  primaryLight: "#E8F5E9",
  primaryDark: "#0D3B12",
  primaryMuted: "#4CAF50",

  // Accent – lavender
  accent: "#7B6FA6",
  accentLight: "#EDE7F6",

  // Semantic — `*Text` = AA-safe (>=4.5:1) on the matching `*Light` background
  success: "#10b981",
  successLight: "#d1fae5",
  successText: "#047857",
  warning: "#f59e0b",
  warningLight: "#fef3c7",
  warningText: "#b45309",
  error: "#ef4444",
  errorLight: "#fee2e2",
  errorText: "#b91c1c",
  info: "#06b6d4",
  infoLight: "#cffafe",
  infoText: "#0e7490",

  // Neutral
  white: "#ffffff",
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceElevated: "#ffffff",
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textTertiary: "#94a3b8",
  textInverse: "#ffffff",

  // Stock specific
  clean: "#10b981",
  cleanLight: "#d1fae5",
  dirty: "#f59e0b",
  dirtyLight: "#fef3c7",
  circulation: "#6366f1",
  circulationLight: "#e0e7ff",
  retired: "#6b7280",

  // Chart palette
  chart: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"],
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const font = {
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 21,
    xxl: 28,
    xxxl: 34,
    display: 42,
  },
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
} as const;

function makeShadow(offsetY: number, blur: number, opacity: number, elevation: number) {
  if (Platform.OS === "web") {
    // boxShadow est une propriété web (react-native-web) absente de ViewStyle.
    return {
      boxShadow: `0px ${offsetY}px ${blur}px rgba(0,0,0,${opacity})`,
    } as unknown as ViewStyle;
  }
  return {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation,
  };
}

export const shadow = {
  sm: makeShadow(1, 3, 0.04, 1),
  md: makeShadow(2, 8, 0.06, 3),
  lg: makeShadow(4, 16, 0.08, 6),
} as const;

export const MIN_HIT_TARGET = 44;

/** Tab bar height excluding the bottom safe-area inset (added at runtime). */
export const TAB_BAR_BASE_HEIGHT = 56;
