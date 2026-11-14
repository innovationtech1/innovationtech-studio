import type { NextConfig } from "next";
import { reescriturasDeAuth } from "./lib/auth-dominio";
import { direccionFija } from "./lib/enlace-fijo";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Versión publicada (para «Reportar un problema»): Netlify usa COMMIT_REF y Vercel VERCEL_GIT_COMMIT_SHA.
  // NEXT_PUBLIC_DIRECCION_FIJA: a dónde mandar a quien entra por un enlace temporal de Netlify (lib/enlace-fijo.ts).
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || "",
    NEXT_PUBLIC_DIRECCION_FIJA: direccionFija(process.env),
  },
  // Inicio de sesión con Google: /__/auth/… se sirve desde Firebase pero bajo la dirección de Studio
  // (así funciona también en el celular). Ver lib/auth-dominio.ts.
  async rewrites() {
    return reescriturasDeAuth(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  },
  async headers() {
    return [
      {
        // El service worker siempre debe revisarse para recibir actualizaciones.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json; charset=utf-8" }],
      },
    ];
  },
};

export default nextConfig;
