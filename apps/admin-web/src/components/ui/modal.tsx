"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className = "" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // L'overlay défile lui-même (overflow-y-auto) : sans ça, un contenu plus haut
    // que l'écran débordait dans le vide et devenait inatteignable — body est en
    // overflow:hidden et l'overlay est fixed, donc rien ne pouvait scroller.
    // items-start sur mobile (la modale part du haut et on déroule), recentré
    // dès sm où la hauteur ne manque plus.
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 animate-in fade-in sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* max-h + flex-col : l'en-tête reste visible, seul le corps défile. */}
      <div
        className={`my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl ${className}`}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="-m-1 rounded-md p-3 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
