// Una foto adjunta en el chat de NOVA o en Textos: lo que NOVA vio se le pasa a la IA como texto.
// Solo reglas, sin pantalla (app/assistant-chat.tsx y Textos en app/page.tsx).

export const PREGUNTA_FOTO = "¿Qué puedo publicar con esta foto?";

const limpia = (d: string | null | undefined) => (typeof d === "string" ? d.replace(/\s+/g, " ").trim() : "");

// El mensaje del chat con la foto: la descripción va al final, entre paréntesis (lib/nova.ts la reconoce)
export function mensajeConFoto(texto: string, descripcion: string | null): string {
  return `${texto.trim() || PREGUNTA_FOTO}\n\n(Foto adjunta: ${limpia(descripcion) || "no se pudo ver"})`;
}

// El tema de «Una publicación» con lo que se ve en la foto
export function temaConFoto(tema: string, descripcion: string | null): string {
  const d = limpia(descripcion);
  if (!d) return tema;
  return `${tema.trim() || "Escribe una publicación para esta foto."}\nEn la foto que acompaña la publicación se ve: ${d}.`;
}
