import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "Zone de livraison — Vaucluse",
  description:
    "Linge Serein livre dans tout le Vaucluse depuis Orange : Avignon, Carpentras, Cavaillon, Apt, Vaison-la-Romaine, L'Isle-sur-la-Sorgue et alentours.",
  robots: { index: true, follow: true },
};

const villes = [
  { name: "Orange", note: "Siège" },
  { name: "Avignon" },
  { name: "Carpentras" },
  { name: "Cavaillon" },
  { name: "Apt" },
  { name: "Vaison-la-Romaine" },
  { name: "L'Isle-sur-la-Sorgue" },
  { name: "Pertuis" },
  { name: "Sorgues" },
  { name: "Bollène" },
  { name: "Pernes-les-Fontaines" },
  { name: "Le Pontet" },
  { name: "Monteux" },
  { name: "Châteauneuf-du-Pape" },
  { name: "Gordes" },
  { name: "Roussillon" },
  { name: "Lourmarin" },
  { name: "Ménerbes" },
];

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
        <p className="text-gray-800 leading-relaxed mb-10 max-w-2xl">
          Depuis notre base d&apos;Orange, nos véhicules sillonnent l&apos;ensemble du département
          du <strong>Vaucluse (84)</strong> chaque semaine. Délai de livraison maximum :{" "}
          <strong>48 heures ouvrées</strong>.
        </p>

        <div className="rounded-3xl overflow-hidden shadow-lg shadow-lavender-100/30 mb-12 aspect-video bg-lavender-50">
          <iframe
            title="Carte du Vaucluse — zone de livraison Linge Serein"
            src="https://www.openstreetmap.org/export/embed.html?bbox=4.65%2C43.75%2C5.65%2C44.45&layer=mapnik&marker=44.13778%2C4.80896"
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <h2 className="font-serif text-2xl font-bold text-forest mb-6">
          Villes et villages desservis
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
          Votre commune n&apos;apparaît pas dans la liste ? Contactez-nous : nous étudions
          systématiquement les demandes en bordure de zone.
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
