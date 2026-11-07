// Nombres de las colecciones de Studio en Firestore, en un solo lugar.
// STUDIO_COLECCION_PREFIJO (por defecto "studio_") permite que las versiones de prueba
// (Deploy Previews / Branch deploys) usen sus propios datos, p. ej. "prueba_studio_".

const PREDETERMINADO = "studio_";

export function prefijoColecciones(): string {
  const p = (process.env.STUDIO_COLECCION_PREFIJO ?? "").trim();
  if (!p) return PREDETERMINADO;
  // Firestore no acepta "/" en el nombre de una colección: solo letras, números, "_" y "-"
  if (!/^[A-Za-z0-9_-]+$/.test(p)) {
    console.warn(`STUDIO_COLECCION_PREFIJO tiene caracteres no válidos («${p}»); se usa «${PREDETERMINADO}».`);
    return PREDETERMINADO;
  }
  return p;
}

export function colecciones() {
  const p = prefijoColecciones();
  return {
    usuarios: `${p}usuarios`,
    negocios: `${p}negocios`,
    uso: `${p}uso`,
    invitaciones: `${p}invitaciones`,
    config: `${p}config`,
    pagosManuales: `${p}pagos_manuales`,
    stripeEventos: `${p}stripe_eventos`,
  };
}
