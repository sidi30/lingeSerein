"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  /**
   * Récapitulatif de l'impact, affiché SOUS la description et AU-DESSUS des
   * boutons. Sert aux suppressions en cascade : on montre ce qui va disparaître
   * avant de le faire disparaître.
   */
  children?: React.ReactNode;
  /**
   * Garde-fou contre le clic réflexe : le bouton de confirmation reste inerte
   * tant que ce texte exact n'a pas été saisi. Réservé aux actions
   * irréversibles à large rayon (suppression d'un client et de son historique).
   */
  requireTypedText?: string;
  /** Verrou externe supplémentaire (ex. aperçu d'impact pas encore chargé). */
  confirmDisabled?: boolean;
  /** `md` élargit la boîte pour un récapitulatif ; `sm` reste le défaut. */
  size?: "sm" | "md";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "primary",
  loading,
  children,
  requireTypedText,
  confirmDisabled,
  size = "sm",
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");
  const typedInputId = useId();

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // On restaure la valeur PRÉCÉDENTE, pas la chaîne vide : ce dialogue peut
    // s'ouvrir par-dessus une Modal qui a déjà verrouillé le défilement, et la
    // refermer rendrait alors le fond scrollable sous la modale restée ouverte.
    const previousOverflow = document.body.style.overflow;
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      if (open) document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // Un dialogue rouvert ne doit pas hériter de la saisie précédente : sinon la
  // deuxième suppression se confirmerait d'un seul clic, ce que la saisie est
  // précisément là pour empêcher.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  if (!open) return null;

  const typedOk = !requireTypedText || typed.trim() === requireTypedText.trim();

  return (
    <div
      ref={overlayRef}
      // overflow-y-auto : une description longue rendait les boutons Confirmer /
      // Annuler inatteignables sur petit écran (body en overflow:hidden, overlay fixed).
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="presentation"
    >
      <div
        className={`my-auto w-full rounded-xl bg-white p-6 shadow-xl ${
          size === "md" ? "max-w-md" : "max-w-sm"
        }`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? "confirm-desc" : undefined}
      >
        <div className="mb-4 flex items-center gap-3">
          {variant === "danger" && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50">
              <AlertTriangle className="h-5 w-5 text-danger-600" />
            </div>
          )}
          <div>
            <h3 id="confirm-title" className="text-base font-semibold text-gray-900">
              {title}
            </h3>
            {description && (
              <p id="confirm-desc" className="mt-1 whitespace-pre-line text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
        </div>

        {children && <div className="mb-4">{children}</div>}

        {requireTypedText && (
          <div className="mb-4">
            <label htmlFor={typedInputId} className="mb-1 block text-xs font-medium text-gray-700">
              Pour confirmer, saisissez{" "}
              <span className="font-semibold text-gray-900">{requireTypedText}</span>
            </label>
            <input
              id={typedInputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-danger-500 focus:outline-none focus:ring-1 focus:ring-danger-500 sm:py-2 sm:text-sm"
            />
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={!typedOk || confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
