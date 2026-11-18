// Enlace entre el sitio y la app de Android en Google Play (Digital Asset Links).
// Google Play publica Studio como una «Trusted Web Activity»: la app abre este sitio a pantalla completa.
// Para que no aparezca la barra del navegador, el sitio debe declarar qué app tiene permiso, con el nombre
// del paquete y la huella SHA-256 con la que Google firma la app. Sin pantalla, para poder probarlo.

export type EnlaceApp = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

// Una huella válida: 32 pares hexadecimales separados por dos puntos (AA:BB:…)
const HUELLA = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PAQUETE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

// `paquete`: ANDROID_PACKAGE (por ejemplo app.netlify.innovationtech_studio.twa)
// `huellas`: ANDROID_SHA256, una o varias separadas por comas (la de Google Play y, si se usa, la de subida)
// Sin datos o con datos mal escritos devuelve una lista vacía: el sitio sigue funcionando igual.
export function enlacesDeApp(paquete: string | undefined, huellas: string | undefined): EnlaceApp[] {
  const nombre = (paquete ?? "").trim();
  if (!PAQUETE.test(nombre)) return [];
  const validas = [...new Set((huellas ?? "").split(",").map((h) => h.trim().toUpperCase()).filter((h) => HUELLA.test(h)))];
  if (validas.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: nombre, sha256_cert_fingerprints: validas },
    },
  ];
}
