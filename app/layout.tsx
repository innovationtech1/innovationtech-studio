import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InnovationTECH Studio",
  description: "Crea textos, imágenes y videos de marketing con IA. Open source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
