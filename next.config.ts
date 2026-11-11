import type { NextConfig } from "next";
import { reescriturasDeAuth } from "./lib/auth-dominio";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Versión publicada (para «Reportar un problema»): Netlify usa COMMIT_REF y Vercel VERCEL_GIT_COMMIT_SHA.
  env: { NEXT_PUBLIC_COMMIT_SHA: process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || "" },
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
