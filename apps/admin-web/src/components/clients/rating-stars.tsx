"use client";

/**
 * Appréciation interne de l'artisan sur son client (1-5).
 * `onChange` absent → affichage seul. Re-cliquer l'étoile courante efface la note.
 */

import { Star } from "lucide-react";

interface RatingStarsProps {
  value: number | null | undefined;
  onChange?: (value: number | null) => void;
  /** Compact : lignes de tableau. */
  size?: "sm" | "md";
  className?: string;
}

export function RatingStars({ value, onChange, size = "md", className = "" }: RatingStarsProps) {
  const iconCls = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const readOnly = !onChange;

  if (readOnly && !value) {
    return <span className={`text-xs text-gray-300 ${className}`}>&mdash;</span>;
  }

  return (
    <div
      className={`flex items-center ${readOnly ? "gap-0.5" : "gap-1"} ${className}`}
      role={readOnly ? "img" : "group"}
      aria-label={readOnly ? `Note : ${value ?? 0} sur 5` : "Appréciation du client"}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (value ?? 0) >= star;
        const icon = (
          <Star
            className={`${iconCls} ${filled ? "fill-warning-500 text-warning-500" : "text-gray-300"}`}
            aria-hidden="true"
          />
        );

        if (readOnly) return <span key={star}>{icon}</span>;

        return (
          <button
            key={star}
            type="button"
            aria-label={`Noter ${star} sur 5`}
            aria-pressed={filled}
            // 44px de cible tactile sur mobile, resserré dès sm.
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-gray-100 sm:h-8 sm:w-8"
            onClick={() => onChange(value === star ? null : star)}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
