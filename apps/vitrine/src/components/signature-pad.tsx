"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Check, RotateCcw } from "lucide-react";

const LS_KEY = "ls_devis_signature";

interface Props {
  /** Signature courante (data URL PNG) ou null. */
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

/**
 * Pad de signature au doigt / à la souris.
 * - Dessin sur canvas transparent → export PNG (data URL).
 * - « Enregistrer par défaut » mémorise dans localStorage ; rechargé au montage.
 * - « Effacer » repart à zéro.
 */
export function SignaturePad({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);
  const [savedDefault, setSavedDefault] = useState(false);

  const ctx = useCallback(() => {
    const c = canvasRef.current;
    return c ? c.getContext("2d") : null;
  }, []);

  // Prépare la résolution (haute densité) sans étirer le trait.
  const setupCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(ratio, ratio);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#1f2937";
  }, []);

  // Dessine une image (data URL) dans le canvas.
  const drawImage = useCallback(
    (dataUrl: string) => {
      const c = canvasRef.current;
      const g = ctx();
      if (!c || !g) return;
      const img = new window.Image();
      img.onload = () => {
        const rect = c.getBoundingClientRect();
        g.clearRect(0, 0, rect.width, rect.height);
        g.drawImage(img, 0, 0, rect.width, rect.height);
        setHasStroke(true);
      };
      img.src = dataUrl;
    },
    [ctx],
  );

  // Montage : configure le canvas, recharge la signature par défaut éventuelle.
  useEffect(() => {
    setupCanvas();
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (saved) {
      setSavedDefault(true);
      drawImage(saved);
      onChange(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const g = ctx();
    if (!g || !last.current) return;
    const p = pos(e);
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
    setHasStroke(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL("image/png"));
  };

  const clear = () => {
    const c = canvasRef.current;
    const g = ctx();
    if (!c || !g) return;
    const rect = c.getBoundingClientRect();
    g.clearRect(0, 0, rect.width, rect.height);
    setHasStroke(false);
    onChange(null);
  };

  const saveDefault = () => {
    const c = canvasRef.current;
    if (!c || !hasStroke) return;
    const url = c.toDataURL("image/png");
    localStorage.setItem(LS_KEY, url);
    onChange(url);
    setSavedDefault(true);
  };

  const removeDefault = () => {
    localStorage.removeItem(LS_KEY);
    setSavedDefault(false);
    clear();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-forest">Ma signature</h3>
        {savedDefault && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-forest">
            <Check size={12} aria-hidden /> Signature par défaut active
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        className="w-full h-32 rounded-lg border border-dashed border-lavender-300 bg-lavender-50/40 touch-none cursor-crosshair"
        aria-label="Zone de signature — dessinez avec la souris ou le doigt"
      />
      <p className="mt-1 text-[11px] text-gray-500">
        Dessinez votre signature ci-dessus. Elle s&apos;ajoute automatiquement au PDF, côté «
        L&apos;émetteur ».
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded-lg border border-lavender-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-lavender-50 transition-colors"
        >
          <Eraser size={13} aria-hidden /> Effacer / recommencer
        </button>
        <button
          type="button"
          onClick={saveDefault}
          disabled={!hasStroke}
          className="inline-flex items-center gap-1 rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={13} aria-hidden /> Enregistrer par défaut
        </button>
        {savedDefault && (
          <button
            type="button"
            onClick={removeDefault}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <RotateCcw size={13} aria-hidden /> Supprimer la signature par défaut
          </button>
        )}
      </div>
      {value === null && <span className="sr-only">Aucune signature</span>}
    </div>
  );
}
