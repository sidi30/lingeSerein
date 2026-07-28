import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, MapPin } from "lucide-react";
import { DELIVERY_DEFAULTS, SERVICE_DELAY_TEXT, URGENCY_TIERS } from "@lingengo/shared";

export const metadata: Metadata = {
  title: "Zone de livraison — Orange et communes limitrophes",
  description:
    "Linge Serein livre Orange et ses communes limitrophes — Jonquières, Courthézon, Camaret-sur-Aigues, Piolenc, Caderousse, Châteauneuf-du-Pape — au même tarif. Au-delà, sur devis.",
  alternates: { canonical: "https://lingeserein.fr/zone-de-livraison" },
  robots: { index: true, follow: true },
};

const villes = [
  { name: "Orange", note: "Siège" },
  { name: "Jonquières" },
  { name: "Courthézon" },
  { name: "Camaret-sur-Aigues" },
  { name: "Piolenc" },
  { name: "Caderousse" },
  { name: "Châteauneuf-du-Pape" },
  { name: "Sérignan-du-Comtat" },
  { name: "Violès" },
  { name: "Travaillan" },
];

const tarifZone = DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS / 100;

export default function ZoneLivraison() {
  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-white/85 backdrop-blur-sm border-b border-lavender-100">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/logo_full.png"
              alt="Linge Serein"
              width={512}
              height={512}
              className="h-9 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-800 hover:text-forest transition-colors"
          >
            <ArrowLeft size={15} aria-hidden />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-20">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-forest mb-3">
          Zone de livraison
        </h1>
        <p className="text-gray-800 leading-relaxed mb-6 max-w-2xl">
          Depuis notre base d&apos;<strong>Orange (84100)</strong>, nous livrons la ville et ses{" "}
          <strong>communes limitrophes</strong>, au même tarif de <strong>{tarifZone} €</strong> —
          offerte dès {DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE} kits à Orange ou dès{" "}
          {DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande. Au-delà de cette couronne,
          nous ne publions pas de tarif : la course est <strong>chiffrée sur devis</strong>, au cas
          par cas.
        </p>
        <p className="text-gray-800 leading-relaxed mb-10 max-w-2xl">
          {SERVICE_DELAY_TEXT.PONCTUEL}
        </p>

        <div className="rounded-2xl bg-white border border-lavender-100/60 shadow-sm p-6 mb-12">
          <h2 className="font-serif text-lg font-bold text-forest mb-4">Délais et urgences</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {URGENCY_TIERS.map((t) => (
              <li
                key={t.level}
                className="flex items-start justify-between gap-3 rounded-xl bg-lavender-50/60 border border-lavender-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-forest">{t.label}</p>
                  <p className="text-xs text-gray-600 leading-snug">{t.delaiText}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-lavender-700 tabular-nums">
                  {t.feeCents === null
                    ? "Sur devis"
                    : t.feeCents === 0
                      ? "Inclus"
                      : `+ ${t.feeCents / 100} €`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-500 leading-relaxed">
            Les forfaits d&apos;urgence sont fixes : ils remplacent le tarif de zone et ne sont pas
            soumis aux seuils de gratuité.
          </p>
        </div>

        <div className="rounded-3xl overflow-hidden shadow-lg shadow-lavender-100/30 mb-12 aspect-video bg-lavender-50">
          <iframe
            title="Carte d'Orange et des communes limitrophes — zone de livraison Linge Serein"
            src="https://www.openstreetmap.org/export/embed.html?bbox=4.62%2C43.98%2C5.05%2C44.30&layer=mapnik&marker=44.13778%2C4.80896"
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <h2 className="font-serif text-2xl font-bold text-forest mb-6">
          Communes desservies au tarif public
        </h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-12">
          {villes.map((v) => (
            <li
              key={v.name}
              className="flex items-center gap-2 rounded-xl bg-white border border-lavender-100/60 px-4 py-3 shadow-sm"
            >
              <MapPin size={16} aria-hidden className="text-lavender-700 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{v.name}</p>
                {v.note && (
                  <p className="text-[10px] uppercase tracking-wider text-forest">{v.note}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="text-sm text-gray-700 mb-10">
          Votre commune n&apos;apparaît pas dans la liste ? Nous livrons quand même, mais sans tarif
          public : contactez-nous et nous chiffrons la course sur devis. Les demandes en bordure de
          zone sont étudiées systématiquement.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-forest px-8 py-3.5 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-colors hover:bg-forest-light"
          >
            Vérifier ma zone
          </Link>
          <Link
            href="/devis"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-lavender-400 px-8 py-3.5 text-sm font-medium text-forest transition-colors hover:bg-lavender-50"
          >
            Lancer un devis
          </Link>
        </div>
      </main>
    </div>
  );
}
