import { Badge } from "./Badge";

type Variant = "default" | "success" | "warning" | "error" | "info";

const ORDER_STATUS: Record<string, { label: string; variant: Variant }> = {
  PENDING: { label: "En attente", variant: "warning" },
  CONFIRMED: { label: "Confirmee", variant: "info" },
  IN_DELIVERY: { label: "En livraison", variant: "info" },
  DELIVERED: { label: "Livree", variant: "success" },
  CANCELLED: { label: "Annulee", variant: "error" },
};

const SUB_STATUS: Record<string, { label: string; variant: Variant }> = {
  ACTIVE: { label: "Active", variant: "success" },
  PAUSED: { label: "En pause", variant: "warning" },
  CANCELLED: { label: "Resiliee", variant: "error" },
  PAST_DUE: { label: "Impayee", variant: "error" },
};

interface Props {
  type: "order" | "subscription";
  status: string;
}

export function StatusBadge({ type, status }: Props) {
  const map = type === "order" ? ORDER_STATUS : SUB_STATUS;
  const info = map[status] ?? { label: status, variant: "default" as Variant };
  return <Badge label={info.label} variant={info.variant} />;
}
