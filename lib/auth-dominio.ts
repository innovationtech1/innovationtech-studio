// Inicio de sesión con Google desde el celular.
// Los navegadores ya no dejan compartir la sesión entre dos direcciones distintas, y por eso fallaba el
// regreso de Google cuando el inicio pasaba por la dirección de Firebase (…firebaseapp.com).
// Solución recomendada por Firebase: que /__/auth/… se sirva desde la MISMA dirección de Studio
// (next.config reescribe esas rutas hacia Firebase) y usar esa dirección como authDomain.
// Sin dependencias: lo usan next.config.ts y lib/firebase-client.ts.

// El authDomain que usa el navegador: la propia dirección del sitio publicado (https);
// en localhost o fuera del navegador, el de Firebase.
export function dominioDeAuth(protocolo: string | undefined, host: string | undefined, deFirebase: string | undefined): string | undefined {
  if (protocolo === "https:" && host && !/^localhost(:|$)/.test(host)) return host;
  return deFirebase;
}

// Las rutas que Studio sirve desde Firebase para el inicio de sesión.
export function reescriturasDeAuth(deFirebase: string | undefined): { source: string; destination: string }[] {
  const dominio = (deFirebase ?? "").trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(dominio)) return [];
  return ["auth", "firebase"].map((carpeta) => ({
    source: `/__/${carpeta}/:ruta*`,
    destination: `https://${dominio}/__/${carpeta}/:ruta*`,
  }));
}
