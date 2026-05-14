"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  ShoppingBag,
  Truck,
  CheckCircle2,
  Plus,
  Minus,
  ChevronRight,
  MapPin,
  Bell,
} from "lucide-react";

type Screen = "stock" | "order" | "track" | "done";

const SCREENS: Screen[] = ["stock", "order", "track", "done"];
const CYCLE_MS = 3800;

export function AppMockup() {
  const [idx, setIdx] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % SCREENS.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const current = SCREENS[idx];

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-cream-warm via-cream to-cream-warm">
      <div className="absolute top-0 left-0 right-0 h-7 flex items-center justify-between px-6 pt-2 text-[10px] font-semibold text-forest-dark z-20">
        <span>9:41</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-1.5 rounded-sm border border-forest-dark/60" />
          <span className="inline-block w-1 h-2 rounded-sm bg-forest-dark/60" />
        </span>
      </div>

      <div className="absolute top-9 left-3 right-3 bottom-12 overflow-hidden rounded-2xl">
        <AnimatePresence mode="wait">
          {current === "stock" && <StockScreen key="stock" />}
          {current === "order" && <OrderScreen key="order" />}
          {current === "track" && <TrackScreen key="track" />}
          {current === "done" && <DoneScreen key="done" />}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-12 bg-white/80 backdrop-blur border-t border-lavender-100 flex items-center justify-around px-2">
        {[
          { i: 0, label: "Stock" },
          { i: 1, label: "Commande" },
          { i: 2, label: "Suivi" },
          { i: 3, label: "Profil" },
        ].map((tab) => {
          const active = idx === tab.i;
          return (
            <div
              key={tab.label}
              className="flex flex-col items-center justify-center gap-0.5 flex-1"
            >
              <span
                className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                  active ? "bg-forest" : "bg-lavender-200"
                }`}
              />
              <span
                className={`text-[8px] font-medium transition-colors ${
                  active ? "text-forest" : "text-gray-400"
                }`}
              >
                {tab.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};

function StockScreen() {
  return (
    <motion.div {...fade} className="h-full p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">Bonjour,</span>
        <Bell size={12} className="text-forest" />
      </div>
      <h3 className="font-serif text-sm font-bold text-forest leading-tight">Mas Provençal</h3>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 220 }}
        className="rounded-xl bg-red-50 border border-red-200 p-2.5"
      >
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5">
            <AlertCircle size={14} className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-red-700 leading-tight">Stock bas</p>
            <p className="text-[9px] text-red-600 mt-0.5 leading-snug">Serviettes : 8 restantes</p>
          </div>
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
            className="shrink-0 text-[9px] font-bold text-red-600 bg-red-100 rounded-full px-1.5 py-0.5"
          >
            !
          </motion.span>
        </div>
      </motion.div>

      <div className="space-y-1.5">
        {[
          { name: "Draps", qty: 42, max: 80, color: "bg-forest" },
          { name: "Taies", qty: 56, max: 100, color: "bg-lavender-500" },
          { name: "Serviettes", qty: 8, max: 60, color: "bg-red-500", warn: true },
        ].map((row, i) => (
          <motion.div
            key={row.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.08 }}
            className="rounded-lg bg-white border border-lavender-100 p-2"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-forest-dark">{row.name}</span>
              <span
                className={`text-[9px] font-bold ${row.warn ? "text-red-600" : "text-gray-600"}`}
              >
                {row.qty}/{row.max}
              </span>
            </div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(row.qty / row.max) * 100}%` }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.7, ease: "easeOut" }}
                className={`h-full ${row.color}`}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-auto rounded-xl bg-forest text-white text-[10px] font-bold py-2 flex items-center justify-center gap-1 shadow-md shadow-forest/20"
      >
        Commander maintenant
        <ChevronRight size={11} />
      </motion.button>
    </motion.div>
  );
}

function OrderScreen() {
  return (
    <motion.div {...fade} className="h-full p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <ShoppingBag size={11} className="text-lavender-600" />
        <span className="text-[10px] font-bold text-forest">Nouvelle commande</span>
      </div>

      {[
        { name: "Serviettes éponge", qty: 60 },
        { name: "Draps king size", qty: 24 },
        { name: "Taies d'oreiller", qty: 30 },
      ].map((item, i) => (
        <motion.div
          key={item.name}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.1 }}
          className="rounded-xl bg-white border border-lavender-100 p-2.5"
        >
          <p className="text-[10px] font-semibold text-forest-dark leading-tight mb-1.5">
            {item.name}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="w-5 h-5 rounded-full bg-lavender-100 flex items-center justify-center">
                <Minus size={9} className="text-lavender-700" />
              </button>
              <motion.span
                key={item.qty}
                initial={{ scale: 1.4, color: "#1b5e20" }}
                animate={{ scale: 1, color: "#1b5e20" }}
                transition={{ duration: 0.3 }}
                className="text-[11px] font-bold tabular-nums w-6 text-center"
              >
                {item.qty}
              </motion.span>
              <button className="w-5 h-5 rounded-full bg-forest flex items-center justify-center">
                <Plus size={9} className="text-white" />
              </button>
            </div>
            <span className="text-[9px] text-gray-500">unités</span>
          </div>
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="rounded-xl bg-lavender-50 border border-lavender-200 p-2.5 mt-auto"
      >
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-gray-600">Livraison</span>
          <span className="text-[10px] font-bold text-forest">Demain 9h-11h</span>
        </div>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="rounded-xl bg-forest text-white text-[10px] font-bold py-2 flex items-center justify-center gap-1 shadow-md shadow-forest/20"
      >
        Valider la commande
        <ChevronRight size={11} />
      </motion.button>
    </motion.div>
  );
}

function TrackScreen() {
  const steps = [
    { label: "Reçue", done: true },
    { label: "Préparation", done: true },
    { label: "En route", done: true, active: true },
    { label: "Livrée", done: false },
  ];
  return (
    <motion.div {...fade} className="h-full p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <Truck size={11} className="text-forest" />
        <span className="text-[10px] font-bold text-forest">Suivi en direct</span>
      </div>

      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 180 }}
        className="relative rounded-2xl bg-gradient-to-br from-forest to-forest-light p-3 text-white overflow-hidden"
      >
        <div className="absolute -right-4 -bottom-4 opacity-20">
          <Truck size={56} />
        </div>
        <p className="text-[9px] opacity-80">Arrivée estimée</p>
        <p className="font-serif text-lg font-bold leading-none">9h27</p>
        <div className="flex items-center gap-1 mt-1 text-[9px] opacity-90">
          <MapPin size={9} />
          <span>3.2 km — Orange centre</span>
        </div>
      </motion.div>

      <div className="relative flex-1">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-lavender-200" />
        {steps.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.12 }}
            className="relative flex items-center gap-2 mb-2"
          >
            <div
              className={`relative z-10 w-4 h-4 rounded-full flex items-center justify-center ${
                s.done ? "bg-forest" : "bg-lavender-100"
              }`}
            >
              {s.done && <CheckCircle2 size={10} className="text-white" />}
              {s.active && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-emerald-400/50"
                  animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
            </div>
            <span
              className={`text-[10px] font-semibold ${
                s.done ? "text-forest-dark" : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {s.active && (
              <span className="text-[8px] text-emerald-600 font-bold uppercase tracking-wider ml-auto">
                Maintenant
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function DoneScreen() {
  return (
    <motion.div
      {...fade}
      className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="relative"
      >
        <div className="absolute inset-0 rounded-full bg-emerald-400/30 blur-2xl scale-150" />
        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-forest flex items-center justify-center shadow-xl shadow-forest/30">
          <CheckCircle2 size={32} className="text-white" strokeWidth={2.5} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <p className="font-serif text-base font-bold text-forest leading-tight">Linge livré !</p>
        <p className="text-[10px] text-gray-500 mt-1">114 pièces — 9h24</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[9px] text-emerald-700 font-medium"
      >
        ✓ Stock rechargé automatiquement
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="text-[9px] text-gray-400"
      >
        Bonne journée 🌿
      </motion.div>
    </motion.div>
  );
}
