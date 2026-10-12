import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaSetup from "./pwa-setup";

export const metadata: Metadata = {
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
      <body>
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
