// Guardar un archivo en el dispositivo y SABER si quedó guardado.
// Regla: primero se escribe; solo si quedó escrito se apunta el clip (o la voz) al archivo nuevo
// y se borra el anterior. Así nunca se pierde lo viejo por un guardado que no entró.

// sin_leer = no se pudo leer la foto o el audio; sin_espacio = el dispositivo no dejó escribir
export type Guardado = "ok" | "sin_leer" | "sin_espacio" | "cambio";
export type FalloGuardado = "sin_leer" | "sin_espacio";

export async function guardarConfirmado(o: {
  id: string;
  blob: Blob | null;
  poner: (id: string, blob: Blob) => Promise<void>;
  quitar: (id: string) => Promise<void>;
  vigente: () => boolean; // ¿lo que se guardó sigue siendo lo que se usa?
}): Promise<Guardado> {
  if (!o.blob) return "sin_leer";
  try {
    await o.poner(o.id, o.blob);
  } catch {
    return "sin_espacio"; // el dispositivo no dejó escribir: está lleno o el navegador no lo permite
  }
  if (!o.vigente()) {
    await o.quitar(o.id).catch(() => {});
    return "cambio";
  }
  return "ok";
}

export const AVISO_SIN_ESPACIO =
  "No se pudo guardar en tu dispositivo (puede que no tenga espacio). Puedes crear tu video ahora, pero si cierras la app eso no estará al volver. Para liberar espacio borra proyectos o videos de la Galería que ya no uses.";

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

// El aviso que ve la persona, según la causa y cuánto espacio hay de verdad en el dispositivo.
export function avisoDeGuardado(causa: FalloGuardado, uso: { used: number; quota: number } | null): string {
  if (causa === "sin_leer") {
    return "No se pudo guardar una de tus fotos en este dispositivo. Puedes crear tu video ahora; si cierras la app, vuelve a poner esa foto.";
  }
  if (!uso || uso.quota <= 0) return AVISO_SIN_ESPACIO;
  // Con espacio de sobra, el problema no es el espacio: el navegador no deja guardar (modo privado o incógnito)
  if (uso.used < uso.quota * 0.8) {
    return "Tu navegador no dejó guardar en este dispositivo; suele pasar en modo privado o incógnito. Puedes crear tu video ahora, pero si cierras la app eso no estará al volver. Abre Studio en una ventana normal o instálala como app.";
  }
  return `No hay espacio para guardar en tu dispositivo (ocupado: ${mb(uso.used)} de ${mb(uso.quota)}). Puedes crear tu video ahora, pero si cierras la app eso no estará al volver. Para liberar espacio borra proyectos o videos de la Galería que ya no uses.`;
}
