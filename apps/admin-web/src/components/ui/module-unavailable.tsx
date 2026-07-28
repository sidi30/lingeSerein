import { PlugZap } from "lucide-react";

interface ModuleUnavailableProps {
  title: string;
  description: string;
}

/**
 * Bandeau affiché quand une route de l'API n'existe pas encore (404).
 *
 * Distinct d'un état vide : « rien à afficher » et « le serveur ne sait pas
 * répondre » n'appellent pas la même réaction. Sans ce message, l'écran serait
 * indiscernable d'une base vide et le propriétaire chercherait ses données.
 */
export function ModuleUnavailable({ title, description }: ModuleUnavailableProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning-500/30 bg-warning-50 px-5 py-4">
      <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-warning-600">{title}</p>
        <p className="mt-0.5 text-sm text-warning-600/80">{description}</p>
      </div>
    </div>
  );
}
