"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Menu, X } from "lucide-react";

const links = [
  { href: "#services", label: "Services" },
  { href: "#espace-client", label: "Espace Client" },
  { href: "#avantages", label: "Avantages" },
  { href: "#fonctionnement", label: "Comment ça marche" },
  { href: "#engagements", label: "Engagements" },
  { href: "#contact", label: "Contact" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isScrolled = mounted && scrolled;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? "glass shadow-md py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3">
          <Image
            src="/images/logo_full.svg"
            alt="Linge Serein"
            width={200}
            height={90}
            className="h-12 md:h-14 w-auto"
            priority
          />
        </a>

        <div className="hidden lg:flex items-center gap-8">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-700 hover:text-forest transition-colors duration-300 relative after:content-[''] after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-lavender-500 after:transition-all after:duration-300 hover:after:w-full"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#contact"
            className="ml-4 inline-flex items-center gap-2 rounded-full bg-forest px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-all duration-300 hover:bg-forest-light hover:shadow-xl hover:shadow-forest/30 hover:-translate-y-0.5"
          >
            Demander un devis
            <ArrowRight size={16} />
          </a>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 rounded-lg hover:bg-lavender-50 transition-colors"
          aria-label="Menu"
        >
          {mobileOpen ? (
            <X size={24} className="text-forest" />
          ) : (
            <Menu size={24} className="text-forest" />
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden glass mt-2 mx-4 rounded-2xl shadow-xl p-6 animate-scale-in">
          <div className="flex flex-col gap-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-base font-medium text-gray-700 hover:text-forest transition-colors py-2 border-b border-lavender-100 last:border-none"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-forest px-6 py-3 text-sm font-medium text-white shadow-lg"
            >
              Demander un devis
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
