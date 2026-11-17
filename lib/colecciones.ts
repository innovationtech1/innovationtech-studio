// Nombres de las colecciones de Studio en Firestore, en un solo lugar.
// STUDIO_COLECCION_PREFIJO (por defecto "studio_") permite que las versiones de prueba
// (Deploy Previews / Branch deploys) usen sus propios datos, p. ej. "prueba_studio_".

const PREDETERMINADO = "studio_";

export function prefijoColecciones(): string {
  const p = (process.env.STUDIO_COLECCION_PREFIJO ?? "").trim();
  if (!p) return PREDETERMINADO;
  // Firestore no acepta "/" en el nombre de una colección: solo letras, números, "_" y "-"
  // Si no es válido se falla en voz alta: usar en silencio «studio_» haría que una versión de prueba
  // leyera y escribiera los datos (y los archivos de R2) del sitio principal.
  if (!/^[A-Za-z0-9_-]+$/.test(p)) {
    throw new Error(`STUDIO_COLECCION_PREFIJO tiene caracteres no válidos («${p}»): usa solo letras, números, «_» y «-», y vuelve a publicar.`);
  }
  return p;
}

// ¿Es el sitio principal? (sin prefijo propio). Las versiones de prueba guardan sus archivos de R2 aparte.
export const esEntornoPrincipal = () => prefijoColecciones() === PREDETERMINADO;

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
    movimientosPaquetes: `${p}paquetes_movimientos`,
    clavesIa: `${p}claves_ia`,
    cuentasBorradas: `${p}cuentas_borradas`,
    huellasPrueba: `${p}huellas_prueba`,
    trabajosVideo: `${p}trabajos_video`,
    cacheVideo: `${p}cache_video`,
    gastoVideo: `${p}gasto_video`,
    candados: `${p}candados`,
    tomasDia: `${p}tomas_dia`,
  };
}
