/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Versión publicada (para «Reportar un problema»): Netlify usa COMMIT_REF y Vercel VERCEL_GIT_COMMIT_SHA.
  env: { NEXT_PUBLIC_COMMIT_SHA: process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || "" },
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
