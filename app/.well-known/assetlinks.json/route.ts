import { enlacesDeApp } from "@/lib/assetlinks";

// https://…/.well-known/assetlinks.json — lo lee Google para confirmar que la app de Android
// (Google Play) es de este sitio. Se llena con ANDROID_PACKAGE y ANDROID_SHA256 en Netlify.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(enlacesDeApp(process.env.ANDROID_PACKAGE, process.env.ANDROID_SHA256), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
