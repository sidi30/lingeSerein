type Props = {
  className?: string;
  label?: string;
};

export function AvailabilityBadge({ className = "", label = "Réponse sous 2h ouvrées" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-forest/5 border border-forest/15 px-3 py-1.5 text-xs font-medium text-forest ${className}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}
