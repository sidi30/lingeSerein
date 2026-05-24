"use client";

import { useEffect, useState } from "react";
import { FileText, Phone } from "lucide-react";

export function StickyCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`lg:hidden fixed bottom-0 inset-x-0 z-40 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-md px-4 pb-4">
        <div className="flex gap-2 rounded-2xl bg-white/95 backdrop-blur-md border border-lavender-100 shadow-2xl shadow-forest/10 p-2">
          <a
            href="/devis"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-medium text-white shadow-md transition-colors duration-200 hover:bg-forest-light"
          >
            <FileText size={16} aria-hidden />
            Devis 2 min
          </a>
          <a
            href="tel:+33753569548"
            aria-label="Appeler Linge Serein au 07 53 56 95 48"
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-lavender-300 px-4 py-3 text-sm font-medium text-forest transition-colors duration-200 hover:bg-lavender-50"
          >
            <Phone size={16} aria-hidden className="text-lavender-700" />
            Appeler
          </a>
        </div>
      </div>
    </div>
  );
}
