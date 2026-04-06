"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Link from "next/link";
import {
  CircleDollarSign,
  Truck,
  RefreshCw,
  UserPlus,
  Plus,
  Users,
  CalendarDays,
  Database,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

interface KPIs {
  revenueCents: number;
  revenuePrevWeekCents: number;
  deliveriesCompleted: number;
  newClients: number;
  activeSubscriptions: number;
  lowStockAlerts: number;
}

interface RevenuePoint {
  month: string;
  revenueCents: number;
}

interface Alert {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  entityId: string;
  createdAt: string;
}

const quickActions = [
  { label: "Nouvelle commande", href: "/commandes", icon: <Plus className="h-4 w-4" />, color: "bg-primary-50 text-primary-600" },
  { label: "Voir les clients", href: "/clients", icon: <Users className="h-4 w-4" />, color: "bg-success-50 text-success-600" },
  { label: "Planning", href: "/planning", icon: <CalendarDays className="h-4 w-4" />, color: "bg-warning-50 text-warning-600" },
  { label: "Gérer le stock", href: "/stock", icon: <Database className="h-4 w-4" />, color: "bg-primary-50 text-primary-600" },
];

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: () => api.get<KPIs>("/dashboard/kpis"),
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["dashboard", "revenue-chart"],
    queryFn: () => api.get<RevenuePoint[]>("/dashboard/revenue-chart"),
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: () => api.get<Alert[]>("/dashboard/alerts"),
  });

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

  const revenueChange = kpis && kpis.revenuePrevWeekCents > 0
    ? Math.round(((kpis.revenueCents - kpis.revenuePrevWeekCents) / kpis.revenuePrevWeekCents) * 100)
    : null;

  const greeting = getGreeting();

  return (
    <>
      <Header title="Tableau de bord" />

      <div className="space-y-6 p-6">
        {/* Welcome + Quick actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {greeting}, {user?.name?.split(" ")[0] ?? "Admin"}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Voici le résumé de votre activité cette semaine.
            </p>
          </div>
          <div className="flex gap-2">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80 ${action.color}`}
              >
                {action.icon}
                <span className="hidden lg:inline">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpisLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : kpis ? (
            <>
              <StatCard
                label="Chiffre d'affaires"
                value={formatCurrency(kpis.revenueCents)}
                trend={revenueChange !== null ? { value: revenueChange, label: "vs sem. préc." } : undefined}
                icon={<CircleDollarSign className="h-5 w-5" />}
              />
              <StatCard
                label="Livraisons"
                value={kpis.deliveriesCompleted}
                trend={{ value: 0, label: "cette semaine" }}
                icon={<Truck className="h-5 w-5" />}
              />
              <StatCard
                label="Abonnements actifs"
                value={kpis.activeSubscriptions}
                icon={<RefreshCw className="h-5 w-5" />}
              />
              <StatCard
                label="Nouveaux clients"
                value={kpis.newClients}
                trend={{ value: 0, label: "cette semaine" }}
                icon={<UserPlus className="h-5 w-5" />}
              />
            </>
          ) : null}
        </div>

        {/* Stock alerts banner */}
        {kpis && kpis.lowStockAlerts > 0 && (
          <Link
            href="/stock"
            className="flex items-center gap-3 rounded-xl border border-warning-500/30 bg-warning-50 px-5 py-3.5 transition-colors hover:bg-warning-50/80"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-600">
                {kpis.lowStockAlerts} alerte{kpis.lowStockAlerts > 1 ? "s" : ""} de stock bas
              </p>
              <p className="text-xs text-warning-500">Cliquez pour voir le détail du stock</p>
            </div>
            <ChevronRight className="h-4 w-4 text-warning-400" />
          </Link>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Revenue Chart */}
          <Card title="Chiffre d'affaires (12 mois)" className="lg:col-span-2">
            {chartLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={288}>
                <AreaChart data={(chartData ?? []).map(p => ({ month: p.month, revenue: p.revenueCents / 100 }))}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1B5E20" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1B5E20" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v: number) => `${v}\u00A0\u20AC`} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(2)}\u00A0\u20AC`, "Chiffre d'affaires"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#1B5E20" strokeWidth={2} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Alerts Feed */}
          <Card
            title="Alertes récentes"
            actions={
              <Button variant="ghost" size="sm" onClick={() => {}}>
                Tout voir
              </Button>
            }
          >
            {alertsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {alerts && alerts.length > 0 ? (
                  alerts.map((alert, idx) => (
                    <div
                      key={`${alert.entityId}-${idx}`}
                      className={`flex items-start gap-3 rounded-lg border-l-[3px] bg-gray-50 p-3 ${
                        alert.severity === "critical"
                          ? "border-l-danger-500"
                          : alert.severity === "warning"
                            ? "border-l-warning-500"
                            : "border-l-primary-400"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge
                            variant={
                              alert.severity === "critical"
                                ? "danger"
                                : alert.severity === "warning"
                                  ? "warning"
                                  : "info"
                            }
                          >
                            {alert.severity === "critical"
                              ? "Critique"
                              : alert.severity === "warning"
                                ? "Attention"
                                : "Info"}
                          </Badge>
                          <span className="text-[11px] text-gray-400">
                            {new Date(alert.createdAt).toLocaleDateString("fr-FR")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{alert.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-gray-200" />
                    <p className="mt-2 text-sm text-gray-400">Aucune alerte</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}
