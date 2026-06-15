import { Ionicons } from "@expo/vector-icons";
import { Badge } from "./Badge";
import { colors } from "@/lib/theme";

type Variant = "default" | "success" | "warning" | "error" | "info";

type Meta = {
  label: string;
  variant: Variant;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  accentBg: string;
};

const ORDER_STATUS: Record<string, Meta> = {
  PENDING: {
    label: "En attente",
    variant: "warning",
    icon: "time-outline",
    accent: colors.warning,
    accentBg: colors.warningLight,
  },
  CONFIRMED: {
    label: "Confirmee",
    variant: "info",
    icon: "checkmark-circle-outline",
    accent: colors.info,
    accentBg: colors.infoLight,
  },
  IN_DELIVERY: {
    label: "En livraison",
    variant: "info",
    icon: "car-outline",
    accent: colors.info,
    accentBg: colors.infoLight,
  },
  DELIVERED: {
    label: "Livree",
    variant: "success",
    icon: "checkmark-done-outline",
    accent: colors.success,
    accentBg: colors.successLight,
  },
  CANCELLED: {
    label: "Annulee",
    variant: "error",
    icon: "close-circle-outline",
    accent: colors.error,
    accentBg: colors.errorLight,
  },
};

const SUB_STATUS: Record<string, Meta> = {
  ACTIVE: {
    label: "Active",
    variant: "success",
    icon: "checkmark-circle-outline",
    accent: colors.success,
    accentBg: colors.successLight,
  },
  PAUSED: {
    label: "En pause",
    variant: "warning",
    icon: "pause-circle-outline",
    accent: colors.warning,
    accentBg: colors.warningLight,
  },
  CANCELLED: {
    label: "Resiliee",
    variant: "error",
    icon: "close-circle-outline",
    accent: colors.error,
    accentBg: colors.errorLight,
  },
  PAST_DUE: {
    label: "Impayee",
    variant: "error",
    icon: "alert-circle-outline",
    accent: colors.error,
    accentBg: colors.errorLight,
  },
};

const FALLBACK: Meta = {
  label: "—",
  variant: "default",
  icon: "ellipse-outline",
  accent: colors.textTertiary,
  accentBg: colors.borderLight,
};

/** Status visual metadata (color, icon, label) — for cards that render their own accent. */
export function statusMeta(type: "order" | "subscription", status: string): Meta {
  const map = type === "order" ? ORDER_STATUS : SUB_STATUS;
  return map[status] ?? { ...FALLBACK, label: status };
}

interface Props {
  type: "order" | "subscription";
  status: string;
  dot?: boolean;
}

export function StatusBadge({ type, status, dot = true }: Props) {
  const info = statusMeta(type, status);
  return <Badge label={info.label} variant={info.variant} dot={dot} />;
}
