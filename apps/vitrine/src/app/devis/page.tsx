"use client";

import { Suspense, useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Percent,
  TrendingUp,
  Calendar,
  Truck,
  Sparkles,
} from "lucide-react";
import { DevisGenerator } from "@/components/devis-generator";
import { ContractGenerator } from "@/components/contract-generator";
import { DevisRequest } from "@/components/devis-request";
import { DevisWizard } from "@/components/devis-wizard";
import { SUBSCRIPTION_DEFAULTS, DELIVERY_DEFAULTS } from "@lingengo/shared";
import type { DeliveryZone } from "@lingengo/shared";
import {
  ABO_PRICE,
  EXTRAS as extras,
  GROUP_DISCOUNT,
  KITS as kits,
  KIT_COMPLET_DETAIL_PRICE,
  KIT_COMPLET_PRICE,
  KIT_COMPLET_SERVIETTES,
  ZONES as zones,
  computeCart,
  fmt,
  fmtShort,
  splitGrouped,
} from "@/lib/devis-catalog";

// NOTE (Option A, ADR-V2-005) : tous les prix proviennent de @lingengo/shared (source de vérité
// de seed) via @/lib/devis-catalog — module partagé avec le wizard public, pour que les deux
// vues ne puissent pas diverger sur un total.

/* ─── Slider ─── */

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  color = "forest",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className={`font-serif text-lg font-bold tabular-nums text-${color}`}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider w-full"
        aria-label={label || "Curseur"}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-[10px] text-gray-600 mt-1 tabular-nums">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

/* ─── Page inner ─── */

function DevisPageInner() {
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";

  const [kitQtys, setKitQtys] = useState<Record<string, number>>({ bain: 8, lit: 4 });
  const [extraQtys, setExtraQtys] = useState<Record<string, number>>({});
  const [grouper, setGrouper] = useState(true);
  const [zoneId, setZoneId] = useState<DeliveryZone>("ORANGE");
  const [livraisonsParMois, setLivraisonsParMois] = useState(4);
  const [mois, setMois] = useState(6);
  const [reduction, setReduction] = useState(0);

  const updateKit = useCallback((id: string, val: number) => {
    setKitQtys((prev) => ({ ...prev, [id]: val }));
  }, []);
  const updateExtra = useCallback((id: string, val: number) => {
    setExtraQtys((prev) => ({ ...prev, [id]: val }));
  }, []);

  const zone = zones.find((z) => z.id === zoneId)!;

  const calc = useMemo(() => {
    // Le groupage est ici une case à cocher : on convertit en quantités explicites
    // (paires + reliquats) avant d'appeler le calcul partagé avec le wizard public.
    const split = splitGrouped(kitQtys.bain ?? 0, kitQtys.lit ?? 0, grouper);
    const cart = computeCart({
      ...split,
      extraQtys,
      zone: zoneId,
      urgency: "STANDARD", // le simulateur commercial ne chiffre que le délai standard
      reductionPct: reduction,
    });

    const margeLivraison = cart.venteApresReduc - cart.sumCout;
    const margePct = cart.venteApresReduc > 0 ? (margeLivraison / cart.venteApresReduc) * 100 : 0;

    const venteMois = cart.venteApresReduc * livraisonsParMois;
    const coutMois = cart.sumCout * livraisonsParMois;
    const margeMois = venteMois - coutMois;

    return {
      ...cart,
      margeLivraison,
      margePct,
      venteMois,
      margeMois,
      venteTotal: venteMois * mois,
      coutTotal: coutMois * mois,
      margeTotal: (venteMois - coutMois) * mois,
    };
  }, [kitQtys, extraQtys, grouper, zoneId, reduction, livraisonsParMois, mois]);

  // Récap texte (joint à la demande envoyée au propriétaire).
  const recap = useMemo(() => {
    const l = calc.lignes.map((x) => `- ${x.qty}× ${x.name} : ${fmt(x.total)}`).join("\n");
    const parts = [
      l,
      calc.groupDiscount > 0
        ? `Dont ${calc.pairs}× Kit Complet — économie déjà comprise : ${fmt(calc.groupDiscount)}`
        : "",
      `Sous-total : ${fmt(calc.totalVente)}`,
      `Livraison (${zone.name}) : ${
        calc.livraisonSurDevis
          ? "sur devis"
          : calc.livraisonFrais === 0
            ? "Offerte"
            : fmt(calc.livraisonFrais)
      }`,
      `Total / rotation : ${fmt(calc.venteApresReduc)}`,
      `Rotations/mois : ${livraisonsParMois}× → estimé ${fmt(calc.venteMois)}/mois`,
      `Engagement envisagé : ${mois} mois`,
    ].filter(Boolean);
    return parts.join("\n");
  }, [calc, zone.name, livraisonsParMois, mois]);

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-white/85 backdrop-blur-sm border-b border-lavender-100 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between">
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
            className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-forest transition-colors"
          >
            <ArrowLeft size={15} aria-hidden />
            Retour
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 md:py-14">
        <div className="text-center mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-forest">
            {isAdmin ? "Simulateur de devis" : "Votre devis en 2 minutes"}
          </h1>
          <p className="mt-2 text-gray-700 text-sm">
            {isAdmin
              ? "Choisissez vos kits, ajustez les quantités, visualisez votre total instantanément."
              : "Quelques questions simples, et vous repartez avec une estimation claire."}
          </p>
          {isAdmin && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lavender-100 px-3 py-1 text-[11px] font-semibold text-lavender-800">
              Mode commercial — rentabilité & génération de devis
            </span>
          )}
        </div>

        {/* Générateurs PDF — admin uniquement */}
        {isAdmin && <DevisGenerator />}
        {isAdmin && <ContractGenerator />}

        {!isAdmin && <DevisWizard />}

        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              {/* Kits */}
              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <h2 className="font-serif text-base font-bold text-forest mb-5">
                  Kits par rotation
                </h2>
                <div className="space-y-6">
                  {kits.map((k) => (
                    <div key={k.id}>
                      <Slider
                        label={`${k.name} — ${fmtShort(k.priceCents)} / rotation`}
                        value={kitQtys[k.id] ?? 0}
                        onChange={(v) => updateKit(k.id, v)}
                        min={0}
                        max={40}
                      />
                      {k.desc && <p className="text-[11px] text-gray-500 mt-1">{k.desc}</p>}
                    </div>
                  ))}
                </div>

                <label className="mt-5 flex items-start gap-2.5 rounded-xl bg-lavender-50 border border-lavender-100 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={grouper}
                    onChange={(e) => setGrouper(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-lavender-300 text-forest focus-visible:ring-forest"
                  />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-forest">
                      Grouper Bain + Lit (Kit Complet)
                    </span>{" "}
                    — {fmtShort(KIT_COMPLET_PRICE)} la paire, avec {KIT_COMPLET_SERVIETTES}{" "}
                    serviettes 50×90 incluses, au lieu de {fmtShort(KIT_COMPLET_DETAIL_PRICE)} à
                    l&apos;unité : soit <strong>−{fmtShort(GROUP_DISCOUNT)} par paire</strong>{" "}
                    livrée ensemble.
                  </span>
                </label>
              </div>

              {/* Extras à l'unité */}
              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <h2 className="font-serif text-base font-bold text-forest mb-1">
                  Articles à l&apos;unité
                </h2>
                <p className="text-[11px] text-gray-500 mb-5">
                  Optionnel — pièces supplémentaires hors kit.
                </p>
                <div className="space-y-6">
                  {extras.map((e) => (
                    <Slider
                      key={e.id}
                      label={`${e.name} — ${fmtShort(e.priceCents)} / pièce`}
                      value={extraQtys[e.id] ?? 0}
                      onChange={(v) => updateExtra(e.id, v)}
                      min={0}
                      max={50}
                    />
                  ))}
                </div>
              </div>

              {/* Zone de livraison */}
              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Truck size={16} aria-hidden className="text-forest" />
                  <h2 className="font-serif text-sm font-bold text-forest">Zone de livraison</h2>
                </div>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-label="Zone de livraison"
                >
                  {zones.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      role="radio"
                      aria-checked={zoneId === z.id}
                      onClick={() => setZoneId(z.id)}
                      className={`min-h-[44px] rounded-xl px-2 py-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 ${
                        zoneId === z.id
                          ? "bg-forest text-white shadow-md"
                          : "bg-lavender-50 text-gray-800 hover:bg-lavender-100"
                      }`}
                    >
                      <p className="font-semibold text-xs">{z.name}</p>
                      <p
                        className={`text-[10px] mt-0.5 ${zoneId === z.id ? "text-white/80" : "text-gray-600"}`}
                      >
                        {z.prix}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-3">
                  {zones.find((z) => z.id === zoneId)?.note}. Livraison offerte dès{" "}
                  {DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE} kits à Orange ou dès{" "}
                  {DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande. Au-delà des villes
                  limitrophes, la course est chiffrée sur devis.
                </p>
              </div>

              {/* Fréquence / engagement / remise */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Truck size={16} aria-hidden className="text-forest" />
                    <h2 className="font-serif text-sm font-bold text-forest">Rotations / mois</h2>
                  </div>
                  <Slider
                    label="Rotations par mois"
                    value={livraisonsParMois}
                    onChange={setLivraisonsParMois}
                    min={1}
                    max={12}
                    suffix="×"
                  />
                </div>

                <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar size={16} aria-hidden className="text-forest" />
                    <h2 className="font-serif text-sm font-bold text-forest">Engagement</h2>
                  </div>
                  <Slider
                    label="Durée"
                    value={mois}
                    onChange={setMois}
                    min={1}
                    max={24}
                    suffix=" mois"
                  />
                </div>

                {isAdmin && (
                  <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Percent size={16} aria-hidden className="text-lavender-700" />
                      <h2 className="font-serif text-sm font-bold text-forest">Réduction</h2>
                    </div>
                    <Slider
                      label="Réduction commerciale"
                      value={reduction}
                      onChange={setReduction}
                      min={0}
                      max={30}
                      suffix="%"
                      color="lavender-700"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Récap */}
            <div className="lg:col-span-5">
              <div className="sticky top-20 space-y-4">
                <div className="rounded-2xl bg-white border border-lavender-100 shadow-lg shadow-lavender-100/20 overflow-hidden">
                  <div className="bg-forest px-5 py-4">
                    <h3 className="font-serif text-base font-bold text-white">
                      Récap par rotation
                    </h3>
                    <p className="text-[11px] text-white/80">Zone {zone.name}</p>
                  </div>
                  <div className="p-5">
                    <div className="space-y-2 mb-4">
                      {calc.lignes.length === 0 && (
                        <p className="text-sm text-gray-700 text-center py-4">
                          Ajoutez des kits pour voir votre devis
                        </p>
                      )}
                      {calc.lignes.map((l) => (
                        <div key={l.name} className="flex justify-between text-sm tabular-nums">
                          <span className="text-gray-800">
                            {l.qty}× {l.name}
                          </span>
                          <span className="font-medium text-gray-900">{fmt(l.total)}</span>
                        </div>
                      ))}
                      {calc.groupDiscount > 0 && (
                        <div className="flex justify-between text-sm tabular-nums text-forest">
                          <span>Économie Kit Complet, déjà comprise</span>
                          <span className="font-semibold">{fmt(calc.groupDiscount)}</span>
                        </div>
                      )}
                    </div>

                    {calc.lignes.length > 0 && (
                      <>
                        <div className="h-px bg-lavender-100 my-3" />

                        <div className="flex justify-between text-sm tabular-nums">
                          <span className="text-gray-700">Sous-total</span>
                          <span className="text-gray-900">{fmt(calc.totalVente)}</span>
                        </div>

                        <div className="flex justify-between text-sm mt-1 tabular-nums">
                          <span className="text-gray-700">Livraison ({zone.name})</span>
                          <span
                            className={
                              calc.livraisonSurDevis
                                ? "font-semibold text-lavender-700"
                                : calc.livraisonFrais === 0
                                  ? "font-semibold text-forest"
                                  : "text-gray-900"
                            }
                          >
                            {calc.livraisonSurDevis
                              ? "Sur devis"
                              : calc.livraisonFrais === 0
                                ? "Offerte"
                                : fmt(calc.livraisonFrais)}
                          </span>
                        </div>

                        {isAdmin && reduction > 0 && (
                          <div className="flex justify-between text-sm mt-1 tabular-nums">
                            <span className="text-lavender-700">Réduction {reduction}%</span>
                            <span className="font-semibold text-lavender-700">
                              -{fmt(calc.reductionMontant)}
                            </span>
                          </div>
                        )}

                        <div className="h-px bg-lavender-100 my-3" />

                        <div className="flex justify-between items-end">
                          <span className="text-sm text-gray-700">Total / rotation</span>
                          <span className="font-serif text-2xl font-bold text-forest tabular-nums">
                            {fmt(calc.venteApresReduc)}
                          </span>
                        </div>

                        <div className="flex justify-between items-end mt-1">
                          <span className="text-xs text-gray-700">
                            Estimé / mois ({livraisonsParMois}×)
                          </span>
                          <span className="font-serif text-base font-semibold text-forest tabular-nums">
                            {fmt(calc.venteMois)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Comparaison abonnement — base = allotissement mensuel FIXE du pack */}
                {calc.lignes.length > 0 && (calc.qBain > 0 || calc.qLit > 0) && (
                  <div className="rounded-2xl bg-lavender-50 border border-lavender-200 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={16} aria-hidden className="text-lavender-700" />
                      <h3 className="font-serif text-sm font-bold text-forest">
                        Pack Sérénité — {fmt(ABO_PRICE)} / mois
                      </h3>
                    </div>
                    {calc.packCouvreVolume ? (
                      <p className="text-xs text-gray-700 leading-relaxed">
                        Le forfait inclut chaque mois {SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain
                        + {SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit +{" "}
                        {SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} livraisons & reprises (une par
                        quinzaine), soit {fmt(calc.packAlaCarte)}/mois à l&apos;unité. À{" "}
                        {fmt(ABO_PRICE)}/mois, vous économisez{" "}
                        <strong className="text-lavender-700">~{fmt(calc.ecoAbo)} / mois</strong>.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-700 leading-relaxed">
                        Votre volume par rotation dépasse l&apos;allotissement mensuel inclus (
                        {SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} bain +{" "}
                        {SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} lit). Le Pack reste une option
                        intéressante : les kits au-delà sont facturés au tarif normal.
                      </p>
                    )}
                    <p className="text-[10px] text-gray-500 mt-2">
                      1 Pack Sérénité / mois ({SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} bain +{" "}
                      {SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} lit) livré en{" "}
                      {SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} passages (
                      {SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY_PER_PASSAGE} bain +{" "}
                      {SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY_PER_PASSAGE} lit par quinzaine, linge
                      repris sous {SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS} jours max), kits
                      au-delà au tarif normal · engagement{" "}
                      {SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois · résiliable ensuite avec{" "}
                      {SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS} j de préavis.
                    </p>
                  </div>
                )}

                {/* Rentabilité admin */}
                {isAdmin && calc.lignes.length > 0 && (
                  <div className="rounded-2xl bg-forest/5 border border-forest/10 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={16} aria-hidden className="text-forest" />
                      <h3 className="font-serif text-sm font-bold text-forest">
                        Rentabilité (interne)
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-700 mb-1">
                          Marge / rotation
                        </p>
                        <p
                          className={`font-serif text-lg font-bold tabular-nums ${calc.margeLivraison >= 0 ? "text-forest" : "text-red-700"}`}
                        >
                          {fmt(calc.margeLivraison)}
                        </p>
                        <p className="text-[10px] text-gray-700 tabular-nums">
                          {calc.margePct.toFixed(1)}% de marge
                        </p>
                      </div>
                      <div className="rounded-xl bg-white p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-700 mb-1">
                          Marge / mois
                        </p>
                        <p
                          className={`font-serif text-lg font-bold tabular-nums ${calc.margeMois >= 0 ? "text-forest" : "text-red-700"}`}
                        >
                          {fmt(calc.margeMois)}
                        </p>
                        <p className="text-[10px] text-gray-700">
                          {livraisonsParMois} rotation{livraisonsParMois > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-white p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-gray-700 mb-1">
                        Total sur {mois} mois
                      </p>
                      <div className="flex items-center justify-center gap-4 tabular-nums">
                        <div>
                          <p className="text-xs text-gray-700">CA client</p>
                          <p className="font-serif text-base font-bold text-gray-900">
                            {fmt(calc.venteTotal)}
                          </p>
                        </div>
                        <div className="h-8 w-px bg-lavender-200" />
                        <div>
                          <p className="text-xs text-gray-700">Coût</p>
                          <p className="font-serif text-base font-bold text-gray-700">
                            {fmt(calc.coutTotal)}
                          </p>
                        </div>
                        <div className="h-8 w-px bg-lavender-200" />
                        <div>
                          <p className="text-xs text-forest">Marge</p>
                          <p
                            className={`font-serif text-base font-bold ${calc.margeTotal >= 0 ? "text-forest" : "text-red-700"}`}
                          >
                            {fmt(calc.margeTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {calc.lignes.length > 0 ? (
                    <DevisRequest
                      recap={recap}
                      lignes={calc.lignes.map((l) => ({
                        designation: l.name,
                        qty: l.qty,
                        unitCents: Math.round(l.total / Math.max(1, l.qty)),
                      }))}
                      livraisonCents={calc.livraisonFrais}
                      zone={zone.name}
                    />
                  ) : (
                    <a
                      href="/#contact"
                      className="group flex items-center justify-center gap-2 rounded-full bg-forest w-full py-3.5 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-colors hover:bg-forest-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                    >
                      Recevoir mon devis officiel
                      <ArrowRight
                        size={15}
                        aria-hidden
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </a>
                  )}
                  <a
                    href="tel:+33753569548"
                    className="flex items-center justify-center rounded-full border border-lavender-300 w-full py-3 text-sm text-forest hover:bg-lavender-50 transition-colors"
                  >
                    07 53 56 95 48
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx global>{`
        .slider {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            #1b5e20 0%,
            #1b5e20 var(--pct, 50%),
            #ede8f5 var(--pct, 50%),
            #ede8f5 100%
          );
          outline: none;
          cursor: pointer;
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 3px solid #1b5e20;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
          cursor: grab;
          transition: transform 0.15s ease;
        }
        .slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.05);
        }
        .slider:focus-visible::-webkit-slider-thumb {
          outline: 3px solid #5e5488;
          outline-offset: 2px;
        }
        .slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 3px solid #1b5e20;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
          cursor: grab;
        }
        .slider::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: #ede8f5;
        }
        .slider::-moz-range-progress {
          height: 6px;
          border-radius: 999px;
          background: #1b5e20;
        }
      `}</style>
    </div>
  );
}

/* ─── Rappel tarifaire statique ───
   Rendu HORS du <Suspense> : le parcours devis dépend de useSearchParams, donc seul le
   fallback est prérendu pour l'export statique. Ce bloc garantit que les prix des kits
   restent présents dans le HTML initial, pour les moteurs comme pour un visiteur sans JS. */

function TarifsReference() {
  return (
    <section className="bg-cream border-t border-lavender-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <h2 className="font-serif text-2xl font-bold text-forest text-center">
          Nos tarifs en un coup d&apos;œil
        </h2>
        <p className="mt-2 mb-8 text-center text-sm text-gray-600">
          Prix par rotation, entretien blanchisserie compris.
        </p>

        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <li className="rounded-2xl bg-white border border-forest/25 p-5">
            <p className="font-serif text-2xl font-bold text-forest tabular-nums">
              {fmtShort(KIT_COMPLET_PRICE)}
            </p>
            <p className="text-sm font-medium text-gray-800">Kit Complet</p>
            <p className="mt-0.5 text-xs text-gray-500 leading-snug">
              Kit Bain + Kit Lit + {KIT_COMPLET_SERVIETTES} serviettes 50×90 incluses, soit −
              {fmtShort(GROUP_DISCOUNT)} par rapport au détail.
            </p>
          </li>
          {kits.map((k) => (
            <li key={k.id} className="rounded-2xl bg-white border border-lavender-100 p-5">
              <p className="font-serif text-2xl font-bold text-forest tabular-nums">
                {fmtShort(k.priceCents)}
              </p>
              <p className="text-sm font-medium text-gray-800">{k.name}</p>
              <p className="mt-0.5 text-xs text-gray-500 leading-snug">{k.desc}</p>
            </li>
          ))}
        </ul>

        <h3 className="font-serif text-base font-bold text-forest mb-3">À l&apos;unité</h3>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
          {extras.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline justify-between gap-2 rounded-xl bg-white border border-lavender-100 px-3 py-2"
            >
              <span className="text-xs text-gray-700">{e.name}</span>
              <span className="text-sm font-semibold text-forest tabular-nums">
                {fmtShort(e.priceCents)}
              </span>
            </li>
          ))}
        </ul>

        <h3 className="font-serif text-base font-bold text-forest mb-3">Livraison</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          {DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS / 100} € à Orange comme dans les communes
          limitrophes, offerte dès {DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE} kits à Orange ou dès{" "}
          {DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande. Au-delà des communes
          limitrophes, la livraison est chiffrée sur devis. Délai standard J+2 à J+3 ; Express 24 h{" "}
          {DELIVERY_DEFAULTS.EXPRESS_24H_FEE_CENTS / 100} € ou jour même{" "}
          {DELIVERY_DEFAULTS.JOUR_MEME_FEE_CENTS / 100} € en option.
        </p>
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">
          {SUBSCRIPTION_DEFAULTS.PLAN_NAME} : {fmtShort(ABO_PRICE)} / mois pour{" "}
          {SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain + {SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits
          lit et {SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} livraisons & reprises incluses, une
          par quinzaine. Engagement {SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois.
        </p>
      </div>
    </section>
  );
}

export default function DevisPage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-dvh bg-cream flex items-center justify-center">
            <p className="text-gray-700">Chargement du simulateur...</p>
          </div>
        }
      >
        <DevisPageInner />
      </Suspense>
      <TarifsReference />
    </>
  );
}
