"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bed,
  Building2,
  Check,
  Home,
  Hotel,
  Layers,
  Minus,
  Plus,
  Send,
  Sparkles,
  Truck,
} from "lucide-react";
import {
  DELIVERY_DEFAULTS,
  SUBSCRIPTION_DEFAULTS,
  URGENCY_TIERS,
  urgencyTier,
} from "@lingengo/shared";
import type { DeliveryZone, UrgencyLevel } from "@lingengo/shared";
import {
  ABO_PRICE,
  EXTRAS,
  GROUP_DISCOUNT,
  KITS,
  KIT_COMPLET_DETAIL_PRICE,
  KIT_COMPLET_PRICE,
  KIT_COMPLET_SERVIETTES,
  ZONES,
  ZONE_BY_ID,
  computeCart,
  fmt,
  fmtShort,
} from "@/lib/devis-catalog";
import { DevisRequest } from "./devis-request";

/* ─── Étapes ─── */

const STEPS = [
  { id: "hebergement", title: "Votre hébergement", short: "Logement" },
  { id: "kits", title: "Vos kits", short: "Kits" },
  { id: "extras", title: "Des extras ?", short: "Extras" },
  { id: "zone", title: "Où vous livrer ?", short: "Livraison" },
  { id: "urgence", title: "Pour quand ?", short: "Délai" },
  { id: "recap", title: "Votre récapitulatif", short: "Récap" },
  { id: "contact", title: "Recevoir mon devis", short: "Devis" },
] as const;

const LAST = STEPS.length - 1;

/* ─── Profils d'hébergement ─── */

interface Preset {
  complet: number;
  bain: number;
  lit: number;
}

const HEBERGEMENTS: {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  preset: Preset;
  hint: string;
}[] = [
  {
    id: "studio",
    label: "Studio / T2",
    desc: "1 chambre, 1 salle de bain",
    icon: <Home size={22} aria-hidden />,
    preset: { complet: 2, bain: 0, lit: 0 },
    hint: "2 kits complets, de quoi tourner entre deux voyageurs.",
  },
  {
    id: "maison",
    label: "Maison / Villa",
    desc: "2 à 4 chambres",
    icon: <Building2 size={22} aria-hidden />,
    preset: { complet: 4, bain: 0, lit: 0 },
    hint: "4 kits complets, un par chambre.",
  },
  {
    id: "gite",
    label: "Gîte",
    desc: "Location saisonnière",
    icon: <Hotel size={22} aria-hidden />,
    preset: { complet: 3, bain: 1, lit: 0 },
    hint: "3 kits complets et un kit bain d'avance.",
  },
  {
    id: "chambres",
    label: "Chambres d'hôtes",
    desc: "Plusieurs chambres en rotation",
    icon: <Bed size={22} aria-hidden />,
    preset: { complet: 4, bain: 2, lit: 0 },
    hint: "4 kits complets et du linge de bain en plus.",
  },
  {
    id: "multi",
    label: "Multi-logements",
    desc: "Plusieurs biens à gérer",
    icon: <Layers size={22} aria-hidden />,
    preset: { complet: 4, bain: 4, lit: 0 },
    hint: `Exactement la dotation du Pack Sérénité (${SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain + ${SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit).`,
  },
];

/* ─── Styles partagés ─── */

const cardBase =
  "w-full rounded-2xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream";
const cardIdle = "border-lavender-100 bg-white hover:border-lavender-300 hover:-translate-y-0.5";
const cardActive = "border-forest bg-forest text-white shadow-lg shadow-forest/20";

/**
 * Navigation aux flèches dans un groupe de boutons `role="radio"` : c'est ce que
 * les lecteurs d'écran annoncent et attendent d'un radiogroup. Le focus se déplace
 * et la sélection suit, comme sur des boutons radio natifs.
 */
function radioGroupKeys(e: React.KeyboardEvent<HTMLDivElement>) {
  const dir =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : 0;
  if (dir === 0) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const idx = items.findIndex((el) => el === document.activeElement);
  if (idx === -1) return;
  e.preventDefault();
  const next = items[(idx + dir + items.length) % items.length];
  next?.focus();
  next?.click();
}

/* ─── Stepper de quantité ─── */

function QtyStepper({
  label,
  value,
  onChange,
  max = 60,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(max, Math.round(v) || 0));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 0}
        aria-label={`Retirer un ${label}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-lavender-200 text-forest transition-colors hover:bg-lavender-50 disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
      >
        <Minus size={16} aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-label={`Quantité de ${label}`}
        className="h-10 w-16 rounded-lg border border-lavender-200 bg-white text-center text-base font-semibold tabular-nums text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label={`Ajouter un ${label}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-lavender-200 text-forest transition-colors hover:bg-lavender-50 disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}

/* ─── Wizard ─── */

export function DevisWizard() {
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(0); // étape la plus avancée atteinte
  const [hebergement, setHebergement] = useState<string | null>(null);
  const [qty, setQty] = useState<Preset>({ complet: 0, bain: 0, lit: 0 });
  const [extraQtys, setExtraQtys] = useState<Record<string, number>>({});
  const [zone, setZone] = useState<DeliveryZone>("ORANGE");
  const [urgency, setUrgency] = useState<UrgencyLevel>("STANDARD");
  const [formule, setFormule] = useState<"ROTATION" | "PACK">("ROTATION");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);

  // Au changement d'étape, le focus part sur le titre : au clavier comme au lecteur
  // d'écran, on reprend la lecture au bon endroit plutôt qu'en haut du document.
  useEffect(() => {
    if (!navigated.current) return;
    headingRef.current?.focus();
  }, [step]);

  const go = useCallback((next: number) => {
    navigated.current = true;
    const target = Math.max(0, Math.min(LAST, next));
    setStep(target);
    setSeen((s) => Math.max(s, target));
  }, []);

  const chooseHebergement = useCallback((id: string) => {
    const h = HEBERGEMENTS.find((x) => x.id === id);
    if (!h) return;
    setHebergement(id);
    setQty({ ...h.preset });
    if (id === "multi") setFormule("PACK");
  }, []);

  const setQtyField = useCallback((field: keyof Preset, v: number) => {
    setQty((prev) => ({ ...prev, [field]: v }));
  }, []);

  const cart = useMemo(
    () =>
      computeCart({
        complet: qty.complet,
        bain: qty.bain,
        lit: qty.lit,
        extraQtys,
        zone,
        urgency,
      }),
    [qty, extraQtys, zone, urgency],
  );

  const nbArticles = useMemo(
    () =>
      qty.complet + qty.bain + qty.lit + Object.values(extraQtys).reduce((s, v) => s + (v || 0), 0),
    [qty, extraQtys],
  );

  // Le Pack n'a de sens que si la dotation couvre le volume demandé.
  const packDispo = cart.packCouvreVolume && (cart.qBain > 0 || cart.qLit > 0);
  const packActif = formule === "PACK" && packDispo;

  useEffect(() => {
    if (formule === "PACK" && !packDispo) setFormule("ROTATION");
  }, [formule, packDispo]);

  const canNext =
    (step === 0 && hebergement !== null) || (step === 1 && nbArticles > 0) || step > 1;

  /* ─── Récap texte + lignes envoyés au propriétaire ─── */

  const zoneInfo = ZONE_BY_ID[zone];
  const urgenceTier = urgencyTier(urgency);
  const etape = STEPS[step] ?? STEPS[0];

  const lignesEnvoyees = useMemo(() => {
    if (packActif) {
      return [
        {
          designation: `${SUBSCRIPTION_DEFAULTS.PLAN_NAME} — ${SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain + ${SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit, ${SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} livraisons & reprises / mois`,
          qty: 1,
          unitCents: ABO_PRICE,
        },
      ];
    }
    return cart.lignes.map((l) => ({
      designation: l.name,
      qty: l.qty,
      unitCents: Math.round(l.total / Math.max(1, l.qty)),
    }));
  }, [packActif, cart.lignes]);

  // Un abonnement suit des rotations planifiées : afficher un forfait d'urgence à côté
  // du Pack contredirait la formule. On annonce le rythme du Pack à la place.
  const rythmeTexte = packActif
    ? `${SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} passages / mois (un par quinzaine)`
    : `${urgenceTier.label} — ${urgenceTier.delaiText}`;

  const recap = useMemo(() => {
    const profil = HEBERGEMENTS.find((h) => h.id === hebergement);
    const entete = [
      profil ? `Type d'hébergement : ${profil.label}` : "",
      `Zone : ${zoneInfo.name}`,
      packActif
        ? `Rythme : ${SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} livraisons & reprises par mois, une par quinzaine`
        : `Délai souhaité : ${urgenceTier.label} — ${urgenceTier.delaiText}`,
    ].filter(Boolean);

    if (packActif) {
      return [
        ...entete,
        "",
        `Formule demandée : ${SUBSCRIPTION_DEFAULTS.PLAN_NAME} — ${fmt(ABO_PRICE)} / mois`,
        `Inclus : ${SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain + ${SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit + ${SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} livraisons & reprises (une par quinzaine, linge repris sous ${SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS} jours max).`,
        `Engagement ${SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois, préavis ${SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS} j.`,
        `Équivalent à l'unité : ${fmt(cart.packAlaCarte)} / mois, soit ~${fmt(cart.ecoAbo)} d'économie.`,
      ].join("\n");
    }

    const lignes = cart.lignes.map((x) => `- ${x.qty}× ${x.name} : ${fmt(x.total)}`).join("\n");
    return [
      ...entete,
      "",
      lignes,
      cart.groupDiscount > 0
        ? `Dont ${cart.pairs}× Kit Complet — économie incluse : ${fmt(cart.groupDiscount)}`
        : "",
      `Sous-total : ${fmt(cart.totalVente)}`,
      `${cart.livraisonLabel} : ${
        cart.livraisonSurDevis
          ? "sur devis"
          : cart.livraisonFrais === 0
            ? "Offerte"
            : fmt(cart.livraisonFrais)
      }`,
      `Total / rotation : ${fmt(cart.venteApresReduc)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }, [hebergement, zoneInfo.name, urgenceTier, packActif, cart]);

  /* ─── Rendu d'une étape ─── */

  const stepContent = () => {
    switch (etape.id) {
      case "hebergement":
        return (
          <div
            role="radiogroup"
            aria-label="Type d'hébergement"
            onKeyDown={radioGroupKeys}
            className="grid gap-3 sm:grid-cols-2"
          >
            {HEBERGEMENTS.map((h) => {
              const active = hebergement === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseHebergement(h.id)}
                  className={`${cardBase} ${active ? cardActive : cardIdle}`}
                >
                  <span className="flex items-start gap-3">
                    <span className={active ? "text-lavender-200" : "text-lavender-700"}>
                      {h.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-serif text-base font-bold">{h.label}</span>
                      <span
                        className={`block text-xs leading-snug ${active ? "text-white/75" : "text-gray-500"}`}
                      >
                        {h.desc}
                      </span>
                      {active && (
                        <span className="mt-1.5 block text-[11px] leading-snug text-lavender-200">
                          {h.hint}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        );

      case "kits":
        return (
          <div className="space-y-3">
            <div className="rounded-2xl border border-forest/25 bg-forest/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-base font-bold text-forest">Kit Complet</h3>
                    <span className="rounded-full bg-forest px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {KIT_COMPLET_SERVIETTES} serviettes incluses
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Kit Bain + Kit Lit + {KIT_COMPLET_SERVIETTES} serviettes 50×90 —{" "}
                    {fmtShort(KIT_COMPLET_PRICE)} au lieu de {fmtShort(KIT_COMPLET_DETAIL_PRICE)} à
                    l&apos;unité, soit −{fmtShort(GROUP_DISCOUNT)} par kit.
                  </p>
                </div>
                <span className="font-serif text-xl font-bold tabular-nums text-forest">
                  {fmtShort(KIT_COMPLET_PRICE)}
                </span>
              </div>
              <div className="mt-3">
                <QtyStepper
                  label="Kit Complet"
                  value={qty.complet}
                  onChange={(v) => setQtyField("complet", v)}
                />
              </div>
            </div>

            {KITS.map((k) => (
              <div key={k.id} className="rounded-2xl border border-lavender-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-serif text-base font-bold text-forest">{k.name}</h3>
                    <p className="mt-0.5 text-xs text-gray-600">{k.desc}</p>
                  </div>
                  <span className="font-serif text-xl font-bold tabular-nums text-forest">
                    {fmtShort(k.priceCents)}
                  </span>
                </div>
                <div className="mt-3">
                  <QtyStepper
                    label={k.name}
                    value={qty[k.id as "bain" | "lit"]}
                    onChange={(v) => setQtyField(k.id as "bain" | "lit", v)}
                  />
                </div>
              </div>
            ))}

            <p className="text-[11px] leading-relaxed text-gray-500">
              Prix par rotation, entretien blanchisserie compris. Vous ajusterez librement avec nous
              avant signature.
            </p>
          </div>
        );

      case "extras":
        return (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Optionnel — des pièces en plus, hors kit. Vous pouvez passer cette étape.
            </p>
            {EXTRAS.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lavender-100 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{e.name}</p>
                  <p className="text-xs tabular-nums text-lavender-700">
                    {fmtShort(e.priceCents)} / pièce
                  </p>
                </div>
                <QtyStepper
                  label={e.name}
                  value={extraQtys[e.id] ?? 0}
                  onChange={(v) => setExtraQtys((prev) => ({ ...prev, [e.id]: v }))}
                />
              </div>
            ))}
          </div>
        );

      case "zone":
        return (
          <div className="space-y-3">
            <div
              role="radiogroup"
              aria-label="Zone de livraison"
              onKeyDown={radioGroupKeys}
              className="grid gap-3"
            >
              {ZONES.map((z) => {
                const active = zone === z.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setZone(z.id)}
                    className={`${cardBase} ${active ? cardActive : cardIdle}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-serif text-base font-bold">{z.name}</span>
                        <span
                          className={`block text-xs leading-snug ${active ? "text-white/75" : "text-gray-500"}`}
                        >
                          {z.note}
                        </span>
                      </span>
                      <span className="shrink-0 font-serif text-base font-bold tabular-nums">
                        {z.prix}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {zone === "HORS_ZONE" ? (
              <div className="rounded-xl border border-lavender-200 bg-lavender-50 p-4">
                <p className="text-sm font-semibold text-lavender-800">
                  On vous fait un devis personnalisé
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-700">
                  Au-delà des communes limitrophes d&apos;Orange, nous ne publions pas de tarif de
                  livraison : la course est chiffrée au cas par cas. Continuez votre devis, nous
                  vous rappelons avec le montant exact.
                </p>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-gray-500">
                Livraison offerte dès {DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE} kits à Orange ou dès{" "}
                {DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande.
              </p>
            )}
          </div>
        );

      case "urgence":
        return (
          <div className="space-y-3">
            <div
              role="radiogroup"
              aria-label="Délai de livraison"
              onKeyDown={radioGroupKeys}
              className="grid gap-3 sm:grid-cols-2"
            >
              {URGENCY_TIERS.map((t) => {
                const active = urgency === t.level;
                const prix =
                  t.feeCents === null
                    ? "Sur devis"
                    : t.feeCents === 0
                      ? "Tarif de zone"
                      : `+ ${fmtShort(t.feeCents)}`;
                return (
                  <button
                    key={t.level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setUrgency(t.level)}
                    className={`${cardBase} ${active ? cardActive : cardIdle}`}
                  >
                    <span className="block font-serif text-base font-bold">{t.label}</span>
                    <span
                      className={`mt-0.5 block text-xs leading-snug ${active ? "text-white/75" : "text-gray-500"}`}
                    >
                      {t.delaiText}
                    </span>
                    <span
                      className={`mt-2 block text-sm font-bold tabular-nums ${active ? "text-lavender-200" : "text-lavender-700"}`}
                    >
                      {prix}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-relaxed text-gray-500">
              Les forfaits d&apos;urgence sont fixes : ils remplacent le tarif de zone et ne sont
              pas soumis aux seuils de gratuité.
            </p>
          </div>
        );

      case "recap":
        return (
          <div className="space-y-4">
            <div className="rounded-2xl border border-lavender-100 bg-white p-4">
              <div className="space-y-2">
                {cart.lignes.map((l) => (
                  <div key={l.name} className="flex justify-between gap-3 text-sm tabular-nums">
                    <span className="text-gray-800">
                      {l.qty}× {l.name}
                    </span>
                    <span className="font-medium text-gray-900">{fmt(l.total)}</span>
                  </div>
                ))}
                {cart.groupDiscount > 0 && (
                  <div className="flex justify-between gap-3 text-sm tabular-nums text-forest">
                    <span>Économie Kit Complet, déjà comprise</span>
                    <span className="font-semibold">{fmt(cart.groupDiscount)}</span>
                  </div>
                )}
              </div>

              <div className="my-3 h-px bg-lavender-100" />

              <div className="flex justify-between gap-3 text-sm tabular-nums">
                <span className="text-gray-700">Sous-total</span>
                <span className="text-gray-900">{fmt(cart.totalVente)}</span>
              </div>
              <div className="mt-1 flex justify-between gap-3 text-sm tabular-nums">
                <span className="min-w-0 text-gray-700">{cart.livraisonLabel}</span>
                <span
                  className={
                    cart.livraisonSurDevis
                      ? "shrink-0 font-semibold text-lavender-700"
                      : cart.livraisonFrais === 0
                        ? "shrink-0 font-semibold text-forest"
                        : "shrink-0 text-gray-900"
                  }
                >
                  {cart.livraisonSurDevis
                    ? "Sur devis"
                    : cart.livraisonFrais === 0
                      ? "Offerte"
                      : fmt(cart.livraisonFrais)}
                </span>
              </div>

              <div className="my-3 h-px bg-lavender-100" />

              <div className="flex items-end justify-between gap-3">
                <span className="text-sm text-gray-700">Total / rotation</span>
                <span className="font-serif text-2xl font-bold tabular-nums text-forest">
                  {fmt(cart.venteApresReduc)}
                </span>
              </div>
            </div>

            {/* Comparaison Pack Sérénité */}
            <div className="rounded-2xl border border-lavender-200 bg-lavender-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={16} aria-hidden className="text-lavender-700" />
                <h3 className="font-serif text-sm font-bold text-forest">
                  {SUBSCRIPTION_DEFAULTS.PLAN_NAME} — {fmt(ABO_PRICE)} / mois
                </h3>
              </div>
              {cart.packCouvreVolume ? (
                <>
                  <p className="text-xs leading-relaxed text-gray-700">
                    Le forfait inclut chaque mois {SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain +{" "}
                    {SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit +{" "}
                    {SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} livraisons & reprises (une par
                    quinzaine, linge repris sous {SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS} jours
                    max), soit {fmt(cart.packAlaCarte)}/mois à l&apos;unité. Vous économisez{" "}
                    <strong className="text-lavender-700">~{fmt(cart.ecoAbo)} / mois</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFormule(packActif ? "ROTATION" : "PACK")}
                    aria-pressed={packActif}
                    className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 ${
                      packActif
                        ? "bg-forest text-white hover:bg-forest-light"
                        : "border border-forest/30 text-forest hover:bg-forest/5"
                    }`}
                  >
                    {packActif ? (
                      <>
                        <Check size={15} aria-hidden /> Pack Sérénité retenu
                      </>
                    ) : (
                      <>
                        Passer au Pack <ArrowRight size={15} aria-hidden />
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-[10px] leading-snug text-gray-500">
                    Engagement {SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois, résiliable
                    ensuite avec {SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS} j de préavis.
                  </p>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-gray-700">
                  Votre volume dépasse l&apos;allotissement mensuel inclus (
                  {SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain +{" "}
                  {SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit). Le Pack reste intéressant : les
                  kits au-delà sont simplement facturés au tarif normal. Parlons-en dans votre
                  devis.
                </p>
              )}
            </div>

            {packActif && (
              <p className="rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-xs leading-relaxed text-forest">
                Votre demande partira sur la formule <strong>Pack Sérénité</strong> à{" "}
                {fmt(ABO_PRICE)} / mois, livraisons comprises.
              </p>
            )}
          </div>
        );

      case "contact":
        return (
          <div className="space-y-4">
            <div className="rounded-2xl border border-lavender-100 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-lavender-700">
                Votre demande
              </p>
              <p className="mt-1 font-serif text-lg font-bold text-forest">
                {packActif
                  ? `${SUBSCRIPTION_DEFAULTS.PLAN_NAME} — ${fmt(ABO_PRICE)} / mois`
                  : `${fmt(cart.venteApresReduc)} / rotation`}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {zoneInfo.name} · {rythmeTexte}
                {!packActif && cart.livraisonSurDevis ? " · livraison sur devis" : ""}
              </p>
            </div>
            <DevisRequest
              recap={recap}
              lignes={lignesEnvoyees}
              livraisonCents={packActif ? 0 : cart.livraisonFrais}
              zone={zoneInfo.name}
            />
            <p className="text-[11px] leading-relaxed text-gray-500">
              Nous vous répondons sous 24 h ouvrées avec un devis officiel. Aucune information
              n&apos;est utilisée à d&apos;autres fins.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  /* ─── Chrome du wizard ─── */

  const pct = Math.round((step / LAST) * 100);
  const totalAffiche = packActif ? ABO_PRICE : cart.venteApresReduc;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Progression */}
      <nav aria-label="Progression du devis" className="mb-5">
        <ol className="hidden gap-1.5 sm:flex">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            const reachable = i <= seen;
            return (
              <li key={s.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => reachable && go(i)}
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                  aria-label={`Étape ${i + 1} sur ${STEPS.length} — ${s.title}`}
                  className={`w-full rounded-lg px-1 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest ${
                    reachable ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span
                    className={`block h-1.5 rounded-full transition-colors ${
                      done || current ? "bg-forest" : "bg-lavender-200"
                    }`}
                  />
                  <span
                    className={`mt-1.5 block text-[10px] font-medium ${
                      current ? "text-forest" : done ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {s.short}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Mobile : barre unique + position */}
        <div className="sm:hidden">
          <div className="flex items-center justify-between text-[11px] font-medium text-gray-600">
            <span>
              Étape {step + 1} sur {STEPS.length}
            </span>
            <span className="text-forest">{etape.short}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-lavender-200">
            <div
              className="h-full rounded-full bg-forest transition-all duration-300"
              style={{ width: `${Math.max(8, pct)}%` }}
            />
          </div>
        </div>
      </nav>

      {/* Carte d'étape */}
      <div className="rounded-3xl border border-lavender-100 bg-white/70 p-5 shadow-sm backdrop-blur-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-xl font-bold text-forest focus-visible:outline-none sm:text-2xl"
          >
            {etape.title}
          </h2>
          {nbArticles > 0 && step > 0 && step < LAST && (
            <span className="rounded-full bg-lavender-100 px-3 py-1 text-xs font-semibold tabular-nums text-lavender-800">
              {packActif ? `${fmt(ABO_PRICE)} / mois` : `${fmt(totalAffiche)} / rotation`}
            </span>
          )}
        </div>

        {/* La clé force le rejeu de l'animation à chaque étape ; la durée est
            neutralisée par la règle prefers-reduced-motion de globals.css. */}
        <div key={etape.id} style={{ animation: "fadeInUp 0.35s ease-out both" }}>
          {stepContent()}
        </div>

        {/* Navigation */}
        {step < LAST && (
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-lavender-100 pt-4">
            <button
              type="button"
              onClick={() => go(step - 1)}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:text-forest disabled:invisible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
            >
              <ArrowLeft size={15} aria-hidden />
              Retour
            </button>

            <div className="flex items-center gap-2">
              {etape.id === "extras" && (
                <button
                  type="button"
                  onClick={() => go(step + 1)}
                  className="rounded-full px-3 py-2.5 text-sm font-medium text-gray-500 underline underline-offset-2 transition-colors hover:text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
                >
                  Passer
                </button>
              )}
              <button
                type="button"
                onClick={() => go(step + 1)}
                disabled={!canNext}
                className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-colors hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              >
                {etape.id === "recap" ? (
                  <>
                    <Send size={15} aria-hidden />
                    Recevoir mon devis
                  </>
                ) : (
                  <>
                    Continuer
                    <ArrowRight size={15} aria-hidden />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === LAST && (
          <div className="mt-6 border-t border-lavender-100 pt-4">
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
            >
              <ArrowLeft size={15} aria-hidden />
              Modifier mon devis
            </button>
          </div>
        )}
      </div>

      {/* Aide contextuelle */}
      <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-gray-500">
        <Truck size={14} aria-hidden className="shrink-0 text-lavender-700" />
        Une question ? Appelez-nous au{" "}
        <a href="tel:+33753569548" className="font-medium text-forest hover:underline">
          07 53 56 95 48
        </a>
      </p>
    </div>
  );
}
