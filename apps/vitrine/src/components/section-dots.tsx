"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "main", label: "Accueil" },
  { id: "services", label: "Services" },
  { id: "fonctionnement", label: "Comment ça marche" },
  { id: "tarifs", label: "Tarifs" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact" },
];

export function SectionDots() {
  const [active, setActive] = useState<string>("main");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visible = new Map<string, number>();

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) visible.set(id, e.intersectionRatio);
            else visible.delete(id);
          }
          let best = "main";
          let bestRatio = 0;
          for (const [k, r] of visible) {
            if (r > bestRatio) {
              best = k;
              bestRatio = r;
            }
          }
          setActive(best);
        },
        { threshold: [0.2, 0.5, 0.8] },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <nav
      aria-label="Navigation rapide"
      className="hidden lg:flex fixed right-6 top-1/2 -translate-y-1/2 z-40 flex-col gap-4"
    >
      {SECTIONS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-label={label}
            aria-current={isActive ? "true" : undefined}
            className="group relative flex items-center justify-end"
          >
            <span
              className={`pointer-events-none absolute right-7 whitespace-nowrap rounded-full bg-forest/90 backdrop-blur px-3 py-1 text-xs font-medium text-white opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 ${
                isActive ? "opacity-100 translate-x-0" : ""
              }`}
            >
              {label}
            </span>
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive
                  ? "w-3 h-3 bg-forest ring-4 ring-forest/15"
                  : "w-2 h-2 bg-lavender-400 hover:bg-lavender-600 hover:scale-125"
              }`}
            />
          </a>
        );
      })}
    </nav>
  );
}
