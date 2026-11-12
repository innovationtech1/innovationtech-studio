// Guardar un archivo en el dispositivo y SABER si quedó guardado.
// Regla: primero se escribe; solo si quedó escrito se apunta el clip (o la voz) al archivo nuevo
// y se borra el anterior. Así nunca se pierde lo viejo por un guardado que no entró.

export type Guardado = "ok" | "fallo" | "cambio";

export async function guardarConfirmado(o: {
  id: string;
  blob: Blob | null;
  poner: (id: string, blob: Blob) => Promise<void>;
  quitar: (id: string) => Promise<void>;
  vigente: () => boolean; // ¿lo que se guardó sigue siendo lo que se usa?
}): Promise<Guardado> {
  if (!o.blob) return "fallo";
  try {
    await o.poner(o.id, o.blob);
  } catch {
    return "fallo"; // casi siempre: no hay espacio en el dispositivo
  }
  if (!o.vigente()) {
    await o.quitar(o.id).catch(() => {});
    return "cambio";
  }
  return "ok";
}

export const AVISO_SIN_ESPACIO =
  "No se pudo guardar en tu dispositivo (puede que no tenga espacio). Puedes crear tu video ahora, pero si cierras la app eso no estará al volver. Para liberar espacio borra proyectos o videos de la Galería que ya no uses.";
