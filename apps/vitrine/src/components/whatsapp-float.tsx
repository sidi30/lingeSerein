"use client";

import { useEffect, useState } from "react";

const PHONE = "33753569548";
const PRESET = encodeURIComponent(
  "Bonjour, je souhaite obtenir des informations sur votre service de linge hôtelier.",
);

export function WhatsAppFloat() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href={`https://wa.me/${PHONE}?text=${PRESET}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Nous écrire sur WhatsApp"
      className={`hidden lg:flex fixed bottom-6 right-6 z-40 items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-xl shadow-emerald-900/20 transition-all duration-300 hover:bg-[#1ebe59] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden fill="currentColor">
        <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39-.043 0-.087-.017-.13-.034-.86-.336-1.629-.844-2.286-1.501-.657-.657-1.165-1.426-1.5-2.287-.018-.043-.034-.087-.034-.13 0-.43 1.39-1.146 1.39-1.518 0-.347-.99-2.31-1.337-2.643-.165-.165-.412-.165-.661-.165h-.247c-.165 0-.43.082-.595.247-.99.99-1.485 2.227-1.485 3.595 0 2.31 2.064 4.46 4.62 6.022 2.561 1.567 4.952 1.567 5.692 1.567 1.371 0 2.608-.495 3.598-1.485.165-.165.247-.43.247-.595v-.247c0-.247 0-.495-.165-.661-.331-.347-2.293-1.337-2.59-1.337l-.001-.018zM16 4C9.373 4 4 9.373 4 16c0 2.296.654 4.43 1.785 6.243L4 28l5.9-1.745A11.93 11.93 0 0 0 16 28c6.627 0 12-5.373 12-12S22.627 4 16 4zm0 22a9.93 9.93 0 0 1-5.234-1.482l-.376-.225-3.503 1.034 1.052-3.41-.245-.39A9.93 9.93 0 0 1 6 16c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10z" />
      </svg>
    </a>
  );
}
