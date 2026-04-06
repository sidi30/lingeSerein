import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/lib/query";
import { ToastProvider } from "@/lib/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Linge Serein — Administration",
  description: "Tableau de bord administrateur Linge Serein — Service B2B de linge hôtelier",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon-192x192.png",
  },
  openGraph: {
    title: "Linge Serein — Administration",
    description: "Votre linge, notre sérénité",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
