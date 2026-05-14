"use client";

import { useEffect, useRef, useState } from "react";
import { Package, Truck, Users, Clock } from "lucide-react";

type Stat = {
  icon: React.ReactNode;
  value: number;
  suffix: string;
  label: string;
  prefix?: string;
};

const stats: Stat[] = [
  {
    icon: <Package size={28} className="text-lavender-600" aria-hidden />,
    value: 2500,
    suffix: " kg",
    label: "Linge traité chaque semaine",
  },
  {
    icon: <Truck size={28} className="text-lavender-600" aria-hidden />,
    value: 48,
    suffix: " h",
    label: "Délai de livraison maximum",
  },
  {
    icon: <Users size={28} className="text-lavender-600" aria-hidden />,
    value: 40,
    suffix: "+",
    label: "Établissements partenaires",
  },
  {
    icon: <Clock size={28} className="text-lavender-600" aria-hidden />,
    value: 99,
    suffix: " %",
    label: "Livraisons à l'heure",
  },
];

function useCountUp(target: number, duration = 1400, start: boolean) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setVal(target);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [start, target, duration]);

  return val;
}

function StatCard({ stat, visible }: { stat: Stat; visible: boolean }) {
  const v = useCountUp(stat.value, 1400, visible);
  return (
    <div className="rounded-3xl bg-white border border-lavender-100/60 p-8 shadow-sm hover:shadow-lg hover:shadow-lavender-100/40 transition-shadow duration-300 text-center">
      <div className="mx-auto mb-4 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lavender-50">
        {stat.icon}
      </div>
      <div className="font-serif text-4xl md:text-5xl font-bold text-forest tabular-nums">
        {stat.prefix ?? ""}
        {v.toLocaleString("fr-FR")}
        {stat.suffix}
      </div>
      <p className="mt-2 text-sm text-gray-700 leading-relaxed">{stat.label}</p>
    </div>
  );
}

export function Stats() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section aria-label="Chiffres clés" className="relative py-20 md:py-28 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div className="mx-auto max-w-7xl px-6">
        <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((s) => (
            <StatCard key={s.label} stat={s} visible={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
