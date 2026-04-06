import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Linge Serein — Votre linge, notre sérénité",
  description:
    "Service B2B de location et entretien de linge hôtelier basé à Orange, Vaucluse. Draps, serviettes et linge de table d'une qualité irréprochable pour votre établissement.",
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
    images: [{ url: "/images/og_image_1200x630.png", width: 1200, height: 630 }],
    locale: "fr_FR",
    type: "website",
  },
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
      <body>{children}</body>
    </html>
  );
}
