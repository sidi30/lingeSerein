"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  BarChart3,
  Package,
  Truck,
  Bell,
  Search,
  Plus,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ShoppingBag,
  Calendar,
  MapPin,
} from "lucide-react";

type View = "dashboard" | "order" | "track";
const VIEWS: View[] = ["dashboard", "order", "track"];
const CYCLE_MS = 4200;

export function AppDashboard() {
  const [idx, setIdx] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % VIEWS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const view = VIEWS[idx] ?? VIEWS[0]!;

  return (
    <div className="relative w-full h-full flex bg-gradient-to-br from-cream-warm via-white to-lavender-50 text-[10px] md:text-xs">
      <Sidebar active={view} setActive={(v) => setIdx(VIEWS.indexOf(v))} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar view={view} />

        <div className="flex-1 overflow-hidden p-3 md:p-5">
          <AnimatePresence mode="wait">
            {view === "dashboard" && <DashboardView key="dashboard" />}
            {view === "order" && <OrderView key="order" />}
            {view === "track" && <TrackView key="track" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive }: { active: View; setActive: (v: View) => void }) {
  const items: { id: View; icon: React.ReactNode; label: string }[] = [
    { id: "dashboard", icon: <BarChart3 size={14} />, label: "Tableau de bord" },
    { id: "order", icon: <ShoppingBag size={14} />, label: "Commandes" },
    { id: "track", icon: <Truck size={14} />, label: "Livraisons" },
  ];

  return (
    <aside className="w-32 md:w-44 bg-forest-dark/95 backdrop-blur text-white flex flex-col p-3 md:p-4 gap-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-lavender-400 flex items-center justify-center">
          <span className="text-forest-dark font-serif font-bold text-[10px]">L</span>
        </div>
        <span className="font-serif font-bold text-white text-[11px] md:text-sm">Linge Serein</span>
      </div>

      <div className="text-[8px] uppercase tracking-wider text-white/40 mt-2">Menu</div>

      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setActive(it.id)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${
              isActive ? "bg-lavender-500/30 text-white" : "text-white/60 hover:bg-white/5"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="sidebar-pill"
                className="absolute left-0 w-0.5 h-5 bg-lavender-400 rounded-r"
              />
            )}
            {it.icon}
            <span className="text-[9px] md:text-[11px] font-medium">{it.label}</span>
          </button>
        );
      })}

      <div className="mt-auto rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[8px] md:text-[9px] text-emerald-300 font-semibold">En ligne</span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ view }: { view: View }) {
  const titles: Record<View, string> = {
    dashboard: "Vue d'ensemble",
    order: "Nouvelle commande",
    track: "Suivi des livraisons",
  };
  return (
    <div className="h-10 md:h-12 border-b border-lavender-100 bg-white/80 backdrop-blur px-3 md:px-5 flex items-center justify-between">
      <h2 className="font-serif text-[12px] md:text-base font-bold text-forest">{titles[view]}</h2>
      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden md:flex items-center gap-1.5 rounded-full bg-lavender-50 border border-lavender-100 px-2 py-1">
          <Search size={10} className="text-lavender-600" />
          <span className="text-[9px] text-gray-500">Rechercher</span>
        </div>
        <div className="relative">
          <Bell size={12} className="text-forest" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </div>
        <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-br from-forest to-lavender-500" />
      </div>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};

function DashboardView() {
  const kpis = [
    {
      label: "Stock total",
      value: "1 248",
      unit: "pièces",
      delta: "+12%",
      icon: <Package size={12} />,
      color: "forest",
    },
    {
      label: "Commandes",
      value: "34",
      unit: "ce mois",
      delta: "+8%",
      icon: <ShoppingBag size={12} />,
      color: "lavender",
    },
    {
      label: "Livraisons",
      value: "99%",
      unit: "à l'heure",
      delta: "+2pts",
      icon: <TrendingUp size={12} />,
      color: "emerald",
    },
  ];

  const stocks = [
    { name: "Draps", qty: 420, max: 500, color: "bg-forest" },
    { name: "Taies d'oreiller", qty: 380, max: 500, color: "bg-lavender-500" },
    { name: "Serviettes éponge", qty: 48, max: 400, color: "bg-red-500", alert: true },
    { name: "Peignoirs", qty: 220, max: 300, color: "bg-emerald-500" },
  ];

  return (
    <motion.div {...fade} className="h-full grid grid-cols-12 gap-2 md:gap-3 overflow-hidden">
      <div className="col-span-12 grid grid-cols-3 gap-2 md:gap-3">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.08 }}
            className="rounded-xl bg-white border border-lavender-100/60 p-2 md:p-3 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] md:text-[10px] uppercase tracking-wider text-gray-500">
                {k.label}
              </span>
              <span className="text-forest/60">{k.icon}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-base md:text-2xl font-bold text-forest tabular-nums">
                {k.value}
              </span>
              <span className="text-[8px] md:text-[9px] text-gray-500">{k.unit}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <TrendingUp size={8} className="text-emerald-600" />
              <span className="text-[8px] md:text-[9px] text-emerald-600 font-semibold">
                {k.delta}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="col-span-12 md:col-span-7 rounded-xl bg-white border border-lavender-100/60 p-2 md:p-3 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] md:text-[11px] font-bold text-forest-dark">
            Stock en temps réel
          </span>
          <span className="text-[8px] md:text-[9px] text-gray-500">Mise à jour: il y a 2 min</span>
        </div>

        <div className="space-y-1.5 md:space-y-2">
          {stocks.map((s, i) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.06 }}
            >
              <div className="flex items-center justify-between text-[9px] md:text-[10px] mb-0.5">
                <span className={`font-semibold ${s.alert ? "text-red-700" : "text-forest-dark"}`}>
                  {s.name}
                </span>
                <span
                  className={`font-bold tabular-nums ${s.alert ? "text-red-600" : "text-gray-600"}`}
                >
                  {s.qty}/{s.max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.qty / s.max) * 100}%` }}
                  transition={{ delay: 0.3 + i * 0.06, duration: 0.7, ease: "easeOut" }}
                  className={`h-full ${s.color}`}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="col-span-12 md:col-span-5 flex flex-col gap-2 md:gap-3 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl bg-red-50 border border-red-200 p-2 md:p-3"
        >
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[9px] md:text-[11px] font-bold text-red-700">Stock bas détecté</p>
              <p className="text-[8px] md:text-[10px] text-red-600 mt-0.5">
                Serviettes : 48 pièces, recommandé &gt; 200
              </p>
              <button className="mt-1.5 text-[8px] md:text-[10px] font-bold text-white bg-red-600 rounded-md px-2 py-1">
                Commander
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-white border border-lavender-100/60 p-2 md:p-3 flex-1"
        >
          <div className="text-[9px] md:text-[11px] font-bold text-forest-dark mb-1.5">
            Prochaine livraison
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-forest flex items-center justify-center">
              <Truck size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] md:text-xs font-bold text-forest">Demain 9h-11h</p>
              <p className="text-[8px] md:text-[10px] text-gray-500">114 pièces</p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function OrderView() {
  const items = [
    { name: "Serviettes éponge 600g", qty: 80, price: 6.0 },
    { name: "Draps king size", qty: 30, price: 9.0 },
    { name: "Taies d'oreiller", qty: 40, price: 1.5 },
  ];
  const total = items.reduce((a, b) => a + b.qty * b.price, 0);

  return (
    <motion.div {...fade} className="h-full grid grid-cols-12 gap-2 md:gap-3 overflow-hidden">
      <div className="col-span-12 md:col-span-8 rounded-xl bg-white border border-lavender-100/60 p-2 md:p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] md:text-[11px] font-bold text-forest-dark">Articles</span>
          <button className="flex items-center gap-1 text-[8px] md:text-[10px] text-forest bg-lavender-50 rounded-full px-2 py-0.5">
            <Plus size={9} />
            Ajouter
          </button>
        </div>

        <div className="space-y-1.5">
          {items.map((it, i) => (
            <motion.div
              key={it.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="rounded-lg bg-lavender-50/50 border border-lavender-100 p-2 flex items-center gap-2"
            >
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-md bg-white flex items-center justify-center shrink-0">
                <Package size={12} className="text-lavender-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] md:text-[11px] font-semibold text-forest-dark truncate">
                  {it.name}
                </p>
                <p className="text-[8px] md:text-[9px] text-gray-500">
                  {it.price.toFixed(2)}€ / unité
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <motion.span
                  key={it.qty}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  className="text-[10px] md:text-xs font-bold text-forest tabular-nums w-6 text-center"
                >
                  {it.qty}
                </motion.span>
                <span className="text-[8px] md:text-[10px] text-gray-500">unités</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="col-span-12 md:col-span-4 flex flex-col gap-2 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl bg-white border border-lavender-100/60 p-2 md:p-3"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar size={11} className="text-lavender-700" />
            <span className="text-[9px] md:text-[11px] font-bold text-forest-dark">Livraison</span>
          </div>
          <p className="text-[10px] md:text-xs font-bold text-forest">Vendredi 17 mai</p>
          <p className="text-[8px] md:text-[10px] text-gray-500">Créneau 9h-11h</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-gradient-to-br from-forest to-forest-light p-2 md:p-3 text-white flex-1 flex flex-col"
        >
          <span className="text-[8px] md:text-[10px] uppercase tracking-wider opacity-80">
            Total HT
          </span>
          <motion.span
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
            className="font-serif text-xl md:text-3xl font-bold mt-0.5 tabular-nums"
          >
            {total.toFixed(2)} €
          </motion.span>
          <button className="mt-auto rounded-md bg-white text-forest text-[9px] md:text-[11px] font-bold py-1.5">
            Valider
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function TrackView() {
  const steps = [
    { label: "Reçue", time: "Hier 16h32", done: true },
    { label: "Préparation", time: "Aujourd'hui 7h15", done: true },
    { label: "En route", time: "Maintenant", done: true, active: true },
    { label: "Livrée", time: "ETA 9h27", done: false },
  ];

  return (
    <motion.div {...fade} className="h-full grid grid-cols-12 gap-2 md:gap-3 overflow-hidden">
      <div className="col-span-12 md:col-span-7 rounded-xl bg-white border border-lavender-100/60 p-2 md:p-3 overflow-hidden">
        <span className="text-[9px] md:text-[11px] font-bold text-forest-dark">Commande #1142</span>

        <div className="relative mt-3 ml-2">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-lavender-200" />
          {steps.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="relative flex items-center gap-2 mb-2.5"
            >
              <div
                className={`relative z-10 w-4 h-4 rounded-full flex items-center justify-center ${
                  s.done ? "bg-forest" : "bg-lavender-100 border border-lavender-300"
                }`}
              >
                {s.done && <CheckCircle2 size={10} className="text-white" />}
                {s.active && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-emerald-400/50"
                    animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}
              </div>
              <div className="flex-1 flex items-center justify-between">
                <span
                  className={`text-[9px] md:text-[11px] font-semibold ${
                    s.done ? "text-forest-dark" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
                <span
                  className={`text-[8px] md:text-[10px] ${
                    s.active ? "text-emerald-600 font-bold" : "text-gray-500"
                  }`}
                >
                  {s.time}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="col-span-12 md:col-span-5 flex flex-col gap-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
          className="relative rounded-xl bg-gradient-to-br from-forest to-forest-light p-2 md:p-3 text-white overflow-hidden"
        >
          <div className="absolute -right-3 -bottom-3 opacity-15">
            <Truck size={60} />
          </div>
          <p className="text-[8px] md:text-[10px] opacity-80 uppercase tracking-wider">
            Arrivée estimée
          </p>
          <p className="font-serif text-xl md:text-3xl font-bold leading-none mt-0.5">9h27</p>
          <div className="flex items-center gap-1 mt-1.5 text-[8px] md:text-[10px] opacity-90">
            <MapPin size={9} />
            <span>3.2 km — Orange centre</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl bg-white border border-lavender-100/60 p-2 md:p-3 flex-1"
        >
          <span className="text-[9px] md:text-[11px] font-bold text-forest-dark">Contenu</span>
          <div className="mt-1.5 space-y-1 text-[8px] md:text-[10px] text-gray-700">
            <div className="flex justify-between">
              <span>Serviettes</span>
              <span className="font-bold">80</span>
            </div>
            <div className="flex justify-between">
              <span>Draps</span>
              <span className="font-bold">30</span>
            </div>
            <div className="flex justify-between border-t border-lavender-100 pt-1 mt-1">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-forest">114 pièces</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
