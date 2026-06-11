import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ScrollProgress } from "@/components/scroll-progress";
import { SectionDots } from "@/components/section-dots";
import { CATALOG_DEFAULTS, SUBSCRIPTION_DEFAULTS } from "@lingengo/shared";
import "./globals.css";

// NOTE (Option A, ADR-V2-005) : les prix du JSON-LD sont dérivés de @lingengo/shared
// (source de vérité de seed). Désynchro possible avec la DB en production — assumée en V1.

function centimes(c: number): string {
  return (c / 100).toFixed(2);
}

const siteUrl = "https://lingeserein.fr";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif-g",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-sans-g",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Linge Serein — Location et entretien de linge hôtelier en Vaucluse",
    template: "%s | Linge Serein",
  },
  description:
    "Service B2B de location et entretien de linge hôtelier basé à Orange, Vaucluse. Draps, serviettes et linge de table d'une qualité irréprochable pour votre établissement.",
  keywords: [
    "linge hôtelier",
    "blanchisserie professionnelle",
    "location linge Vaucluse",
    "draps hôtel Orange",
    "serviettes Airbnb",
    "linge gîte Provence",
  ],
  authors: [{ name: "Linge Serein" }],
  icons: {
    icon: [
      { url: "/favicon_32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon_16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon_192.png",
  },
  openGraph: {
    title: "Linge Serein — Votre linge, notre sérénité",
    description: "Service B2B de location et entretien de linge hôtelier basé à Orange, Vaucluse.",
    url: siteUrl,
    siteName: "Linge Serein",
    images: [{ url: "/images/og_image_1200x630.png", width: 1200, height: 630 }],
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Linge Serein — Votre linge, notre sérénité",
    description: "Service B2B de location et entretien de linge hôtelier en Vaucluse.",
    images: ["/images/og_image_1200x630.png"],
  },
  alternates: { canonical: siteUrl },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // TODO: coller le code fourni par Google Search Console après vérification
  // verification: { google: "xxxxxxxxxxxxxxxxxxxxxxxx" },
};

// Catalogue d'offres structuré : permet aux IA et à Google d'extraire l'offre
// et les prix de départ de manière fiable. Déclaré avant le schéma business qui le référence.
const offerCatalog = {
  "@type": "OfferCatalog",
  name: "Offres Linge Serein",
  itemListElement: [
    {
      "@type": "Offer",
      name: "Kit Bain",
      description: "Drap de bain 70×150 + Serviette 50×90 + Tapis 50×70.",
      price: centimes(CATALOG_DEFAULTS.KIT_BAIN_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Kit Lit",
      description: "Housse de couette + Drap housse + Taies.",
      price: centimes(CATALOG_DEFAULTS.KIT_LIT_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: `Pack Sérénité — abonnement mensuel (engagement ${SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois)`,
      description: `Formule mensuelle de location et entretien de linge, ${SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain + ${SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit, livraison incluse. Engagement minimum ${SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois, résiliable ensuite avec ${SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS} jours de préavis.`,
      price: centimes(SUBSCRIPTION_DEFAULTS.PRICE_CENTS),
      priceCurrency: "EUR",
    },
  ],
};

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "DryCleaningOrLaundry",
  "@id": `${siteUrl}/#business`,
  name: "Linge Serein",
  slogan: "Votre linge, notre sérénité.",
  description: `Linge Serein loue, livre et entretient le linge hôtelier (draps, serviettes, linge de bain et de lit) des hôtels, gîtes, chambres d'hôtes et locations saisonnières du Vaucluse. Qualité hôtelière, démarche éco-responsable (Ecolabel, méthode RABC), engagement ${SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois, livraison en 48 h depuis Orange.`,
  image: `${siteUrl}/images/og_image_1200x630.png`,
  logo: `${siteUrl}/images/logo_full_512.png`,
  url: siteUrl,
  telephone: "+33753569548",
  email: "lingeserein@gmail.com",
  priceRange: "€€",
  currenciesAccepted: "EUR",
  hasOfferCatalog: offerCatalog,
  address: {
    "@type": "PostalAddress",
    streetAddress: "Rue Simone Weil",
    addressLocality: "Orange",
    postalCode: "84100",
    addressRegion: "Vaucluse",
    addressCountry: "FR",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 44.1383,
    longitude: 4.809,
  },
  areaServed: [
    { "@type": "City", name: "Orange" },
    { "@type": "City", name: "Avignon" },
    { "@type": "City", name: "Carpentras" },
    { "@type": "AdministrativeArea", name: "Vaucluse" },
  ],
  knowsAbout: [
    "location de linge hôtelier",
    "blanchisserie professionnelle",
    "entretien de draps et serviettes",
    "linge pour gîtes et Airbnb",
  ],
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "08:00",
      closes: "18:00",
    },
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5",
    reviewCount: "3",
    bestRating: "5",
    worstRating: "1",
  },
  review: [
    {
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      author: { "@type": "Person", name: "Marie-Claire D." },
      reviewBody:
        "Depuis que nous travaillons avec Linge Serein, la qualité du linge n'est plus un sujet. Nos clients le remarquent.",
    },
    {
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      author: { "@type": "Person", name: "Thomas R." },
      reviewBody:
        "Un service impeccable, toujours à l'heure. L'équipe s'adapte à nos pics d'activité en saison estivale.",
    },
    {
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      author: { "@type": "Person", name: "Sophie L." },
      reviewBody:
        "La démarche éco-responsable a été déterminante dans notre choix. Un vrai partenariat.",
    },
  ],
  // TODO: ajouter ici les URL des profils (Google Business Profile, Facebook, Instagram, LinkedIn)
  sameAs: [],
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: "Linge Serein",
  url: siteUrl,
  logo: {
    "@type": "ImageObject",
    url: `${siteUrl}/images/logo_full_512.png`,
    width: 512,
    height: 512,
  },
  image: `${siteUrl}/images/og_image_1200x630.png`,
  description:
    "Service B2B de location, livraison et entretien de linge hôtelier (draps, serviettes, linge de table) basé à Orange, dans le Vaucluse.",
  email: "lingeserein@gmail.com",
  telephone: "+33753569548",
  foundingLocation: { "@type": "Place", name: "Orange, Vaucluse, France" },
  address: {
    "@type": "PostalAddress",
    streetAddress: "Rue Simone Weil",
    addressLocality: "Orange",
    postalCode: "84100",
    addressRegion: "Vaucluse",
    addressCountry: "FR",
  },
  areaServed: { "@type": "AdministrativeArea", name: "Vaucluse" },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+33753569548",
    contactType: "customer service",
    email: "lingeserein@gmail.com",
    areaServed: "FR",
    availableLanguage: "French",
  },
  // TODO: ajouter ici les URL des profils une fois créés (Google Business Profile, Facebook, Instagram, LinkedIn)
  sameAs: [] as string[],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  url: siteUrl,
  name: "Linge Serein",
  description:
    "Location et entretien de linge hôtelier en Vaucluse — draps, serviettes et linge de table pour hôtels, gîtes et locations saisonnières.",
  inLanguage: "fr-FR",
  publisher: { "@id": `${siteUrl}/#organization` },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Accueil",
      item: `${siteUrl}/`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Devis gratuit",
      item: `${siteUrl}/devis`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Zone de livraison",
      item: `${siteUrl}/zone-de-livraison`,
    },
  ],
};

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": `${siteUrl}/#service`,
  serviceType: "Location et entretien de linge hôtelier",
  name: "Location et entretien de linge hôtelier en Vaucluse",
  description: `Location, livraison et blanchisserie professionnelle de linge hôtelier (draps, serviettes, linge de bain et de lit) pour hôtels, gîtes, chambres d'hôtes et locations saisonnières du Vaucluse. Démarche éco-responsable (Ecolabel, RABC), engagement ${SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois, livraison en 48 h.`,
  provider: { "@id": `${siteUrl}/#organization` },
  areaServed: [
    { "@type": "City", name: "Orange" },
    { "@type": "City", name: "Avignon" },
    { "@type": "City", name: "Carpentras" },
    { "@type": "AdministrativeArea", name: "Vaucluse" },
  ],
  audience: {
    "@type": "BusinessAudience",
    name: "Hôtels, gîtes, chambres d'hôtes, résidences de tourisme et locations saisonnières",
  },
  offers: [
    {
      "@type": "Offer",
      name: `Pack Sérénité — abonnement mensuel (engagement ${SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois)`,
      price: centimes(SUBSCRIPTION_DEFAULTS.PRICE_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Serviette 50×90",
      price: centimes(CATALOG_DEFAULTS.SERVIETTE_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Drap de bain 70×150",
      price: centimes(CATALOG_DEFAULTS.DRAP_BAIN_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Tapis de bain 50×70",
      price: centimes(CATALOG_DEFAULTS.TAPIS_BAIN_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Petite serviette 30×50",
      price: centimes(CATALOG_DEFAULTS.PETITE_SERVIETTE_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Drap housse",
      price: centimes(CATALOG_DEFAULTS.DRAP_HOUSSE_CENTS),
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Housse de couette",
      price: centimes(CATALOG_DEFAULTS.HOUSSE_COUETTE_CENTS),
      priceCurrency: "EUR",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${playfair.variable} ${inter.variable}`}>
      <head>
        {/* Préchargement de l'image LCP du hero (export statique : next/image priority n'émet pas de preload fiable en mode fill) */}
        <link rel="preload" as="image" href="/site/hero-principal.webp" fetchPriority="high" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      </head>
      <body suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-forest focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
        >
          Aller au contenu principal
        </a>
        <ScrollProgress />
        <SectionDots />
        {children}
      </body>
    </html>
  );
}
