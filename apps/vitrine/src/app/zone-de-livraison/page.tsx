import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import {
  DELIVERY_DEFAULTS,
  SERVICE_DELAY_TEXT,
  URGENCY_TIERS,
  VAUCLUSE_COMMUNES,
} from "@lingengo/shared";
import { ZONES } from "@/lib/devis-catalog";

const nbCommunes = VAUCLUSE_COMMUNES.length;

export const metadata: Metadata = {
  title: "Zone de livraison — tout le Vaucluse depuis Orange",
  description: `Linge Serein livre les ${nbCommunes} communes du Vaucluse depuis Orange : Avignon, Carpentras, Cavaillon, L'Isle-sur-la-Sorgue, Pertuis, Apt, Vaison-la-Romaine. Livraison incluse à Orange, tarif publié pour chaque commune selon la distance.`,
  alternates: { canonical: "https://lingeserein.fr/zone-de-livraison" },
  robots: { index: true, follow: true },
};

/** Communes de chaque palier, par ordre de distance croissante depuis Orange. */
const communesParZone = ZONES.map((zone) => ({
  zone,
  communes: [...VAUCLUSE_COMMUNES.filter((c) => c.zone === zone.id)].sort(
    (a, b) => a.kmDepuisOrange - b.kmDepuisOrange,
  ),
}));

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
          Zone de livraison — tout le Vaucluse
        </h1>
        <p className="text-gray-800 leading-relaxed mb-6 max-w-2xl">
          Depuis notre base d&apos;<strong>Orange (84100)</strong>, nous livrons les{" "}
          <strong>{nbCommunes} communes du Vaucluse</strong> — Avignon, Carpentras, Cavaillon,
          L&apos;Isle-sur-la-Sorgue, Pertuis, Apt, Vaison-la-Romaine comprises. Chacune a un{" "}
          <strong>tarif publié</strong>, fonction de sa distance depuis Orange : rien n&apos;est
          chiffré au cas par cas. La livraison est <strong>incluse à Orange</strong> et{" "}
          <strong>offerte dès {DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande</strong>{" "}
          sur les paliers payants. En dehors du département, nous ne livrons pas.
        </p>
        <p className="text-gray-800 leading-relaxed mb-10 max-w-2xl">
          {SERVICE_DELAY_TEXT.PONCTUEL}
        </p>

        <div className="rounded-2xl bg-white border border-lavender-100/60 shadow-sm p-6 mb-12">
          <h2 className="font-serif text-lg font-bold text-forest mb-4">
            Le barème, du plus proche au plus lointain
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ZONES.map((z) => (
              <li
                key={z.id}
                className="flex items-start justify-between gap-3 rounded-xl bg-lavender-50/60 border border-lavender-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-forest">{z.name}</p>
                  <p className="text-xs text-gray-600 leading-snug">{z.note}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-lavender-700 tabular-nums">
                  {z.prix}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-500 leading-relaxed">
            Les distances sont mesurées depuis Orange. La livraison est offerte dès{" "}
            {DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande sur les paliers payants.
          </p>
        </div>

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
            title="Carte du Vaucluse — zone de livraison Linge Serein, au départ d'Orange"
            src="https://www.openstreetmap.org/export/embed.html?bbox=4.62%2C43.62%2C5.80%2C44.42&layer=mapnik&marker=44.13778%2C4.80896"
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <h2 className="font-serif text-2xl font-bold text-forest mb-2">
          Les {nbCommunes} communes desservies, et leur tarif
        </h2>
        <p className="text-sm text-gray-600 mb-6 max-w-2xl">
          La liste est exhaustive : elle vaut engagement de prix. Cherchez la vôtre — le tarif de sa
          ligne est celui qui figurera sur votre devis.
        </p>

        {communesParZone.map(({ zone, communes }) => (
          <section key={zone.id} className="mb-8">
            <h3 className="font-serif text-lg font-bold text-forest mb-1">
              {zone.name} — {zone.prix}
            </h3>
            <p className="text-xs text-gray-600 mb-3">{zone.note}</p>
            <ul className="flex flex-wrap gap-2">
              {communes.map((c) => (
                <li
                  key={c.codeInsee}
                  className="rounded-lg bg-white border border-lavender-100/60 px-3 py-1.5 text-xs text-gray-800 shadow-sm"
                >
                  {c.nom} <span className="text-gray-500">({c.codesPostaux.join(" / ")})</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="text-sm text-gray-700 mb-10 mt-12">
          Votre commune n&apos;apparaît pas ? C&apos;est qu&apos;elle est hors du Vaucluse : nous ne
          la desservons pas. Écrivez-nous quand même, nous vous orienterons vers un confrère.
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
