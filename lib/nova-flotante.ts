// NOVA en todas las secciones: dónde se muestra el chat (en su sitio de Textos, flotando sobre la
// sección abierta, u oculto), cuándo hay botón flotante y cómo se llama el lugar donde está la persona.
// Solo reglas, sin pantalla: las usa app/page.tsx y se prueban solas.

export type TabNova = "texto" | "imagen" | "editor" | "video" | "galeria" | "marca" | "config";
type Modos = { textMode: "chat" | "post" | "calendario"; imageMode: "ia" | "carrusel"; videoMode: "guiado" | "video" | "secuencia" };

// Hay un solo chat: o va en su sitio (Textos → Asistente), o flota sobre lo que se está haciendo
export function lugarDeNova(o: { tab: TabNova; textMode: Modos["textMode"]; panel: boolean }): { chat: "sitio" | "panel" | "oculto"; boton: boolean } {
  if (o.tab === "texto" && o.textMode === "chat") return { chat: "sitio", boton: false };
  return o.panel ? { chat: "panel", boton: false } : { chat: "oculto", boton: true };
}

const TEXTO = { chat: "Textos → Asistente", post: "Textos → Una publicación", calendario: "Textos → Calendario de 30 días" } as const;
const IMAGEN = { ia: "Imágenes", carrusel: "Imágenes → Carrusel para Instagram" } as const;
const VIDEO = { guiado: "Videos → Crear video con NOVA", video: "Videos → Editor avanzado", secuencia: "Videos → Secuencia de fotos" } as const;
const OTRAS = { editor: "Editor", galeria: "Galería", marca: "Mi marca", config: "Configuración" } as const;

// El nombre, tal como se ve en pantalla, de donde está la persona
export function seccionDeNova(o: { tab: TabNova } & Modos): string {
  if (o.tab === "texto") return TEXTO[o.textMode];
  if (o.tab === "imagen") return IMAGEN[o.imageMode];
  if (o.tab === "video") return VIDEO[o.videoMode];
  return OTRAS[o.tab];
}

const SECCIONES = new Set<string>([...Object.values(TEXTO), ...Object.values(IMAGEN), ...Object.values(VIDEO), ...Object.values(OTRAS)]);

// Lo que llega del navegador: solo pasa si es una sección que existe (no se cuela texto libre a NOVA)
export const limpiarSeccion = (v: unknown): string | null => (typeof v === "string" && SECCIONES.has(v) ? v : null);
