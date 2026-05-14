import type { Metadata } from "next";
import Script from "next/script";
import { ScrollProgress } from "@/components/scroll-progress";
import { SectionDots } from "@/components/section-dots";
import "./globals.css";

const siteUrl = "https://lingeserein.fr";

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
  robots: { index: true, follow: true },
};

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Linge Serein",
  image: `${siteUrl}/images/og_image_1200x630.png`,
  url: siteUrl,
  telephone: "+33685218270",
  email: "lingeserein@gmail.com",
  priceRange: "€€",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Orange",
    addressRegion: "Vaucluse",
    addressCountry: "FR",
  },
  areaServed: {
    "@type": "AdministrativeArea",
    name: "Vaucluse",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "08:00",
      closes: "18:00",
    },
  ],
  sameAs: [],
};

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Location et entretien de linge hôtelier",
  provider: { "@type": "LocalBusiness", name: "Linge Serein" },
  areaServed: { "@type": "AdministrativeArea", name: "Vaucluse" },
  offers: [
    { "@type": "Offer", name: "Pack Confort", price: "6.00", priceCurrency: "EUR" },
    { "@type": "Offer", name: "Pack Hôtel", price: "9.00", priceCurrency: "EUR" },
    { "@type": "Offer", name: "Pack Prestige", price: "14.00", priceCurrency: "EUR" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
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
        <Script id="ld-local-business" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify(localBusinessSchema)}
        </Script>
        <Script id="ld-service" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify(serviceSchema)}
        </Script>
      </body>
    </html>
  );
}
