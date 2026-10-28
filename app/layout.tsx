import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/instrument-sans/index.css";
import "./globals.css";
import PwaSetup from "./pwa-setup";

// Dirección pública de la app, para que la vista previa al compartir el enlace (WhatsApp, Facebook…)
// muestre la imagen. En Vercel se detecta sola, también en las copias (forks) de otras personas.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  || "https://innovationtech-studio.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "InnovationTECH Studio",
  description: "Crea textos, imágenes y videos de marketing con IA. Open source.",
  applicationName: "InnovationTECH Studio",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iPhone / iPad: abrir como app a pantalla completa al agregarla a la pantalla de inicio
  appleWebApp: {
    capable: true,
    title: "IT Studio",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  // Windows: mosaico del menú Inicio
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#070d1f",
    "msapplication-TileImage": "/icons/mstile-150.png",
    "msapplication-config": "/browserconfig.xml",
  },
  openGraph: {
    title: "InnovationTECH Studio",
    description: "Crea textos, imágenes y videos de marketing con IA. Open source.",
    images: [{ url: "/icons/og-1024.jpg", width: 1024, height: 1024 }],
    type: "website",
    siteName: "InnovationTECH Studio",
    locale: "es_MX",
  },
  twitter: {
    card: "summary_large_image",
    title: "InnovationTECH Studio",
    description: "Crea textos, imágenes y videos de marketing con IA. Open source.",
    images: ["/icons/og-1024.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#070d1f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Fuentes del editor de imágenes */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Lobster&family=Montserrat:ital,wght@0,400;0,700;0,800;1,400;1,700&family=Oswald:wght@400;700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Poppins:ital,wght@0,400;0,700;1,400&family=Roboto+Slab:wght@400;700&display=swap"
        />
      </head>
      <body>
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
