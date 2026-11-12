// Lógica de la cámara en vivo (sin pantalla, para poder probarla).

// Qué decirle a la persona cuando la cámara no abre. `nombre` es el name del error del navegador,
// o "SinSoporte" si el navegador no tiene cámara para páginas web.
export function mensajeCamara(nombre: string): string {
  switch (nombre) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permite el uso de la cámara para tomar la foto. Toca el candado junto a la dirección de la página, activa «Cámara» y vuelve a intentar.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No encontramos una cámara en este dispositivo. Puedes subir la foto desde tus archivos.";
    case "NotReadableError":
    case "AbortError":
      return "La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentar.";
    case "SinMicrofono":
      return "No hay permiso de micrófono: el video se grabará sin sonido.";
    case "SinCamaras":
      return "No detectamos ninguna cámara en este equipo. Conecta una (o revisa que no esté apagada o tapada) y toca «Buscar la cámara otra vez». También puedes subir el archivo desde tu dispositivo.";
    case "SinSoporte":
      return "Este navegador no permite usar la cámara desde la página. Sube la foto desde tus archivos.";
    default:
      return "No se pudo abrir la cámara. Intenta de nuevo o sube la foto desde tus archivos.";
  }
}

// Tamaño con el que se guarda la foto: como mucho `max` por lado, sin deformar y sin agrandar.
export function tamanoCaptura(ancho: number, alto: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(ancho, alto, 1));
  return { w: Math.max(1, Math.round(ancho * k)), h: Math.max(1, Math.round(alto * k)) };
}

// ---------- Grabar video ----------

export const MAX_GRABACION = 60; // segundos por grabación

// Lo grabado y el máximo: 7 → «0:07 / 1:00»
export function relojGrabacion(segundos: number): string {
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  const s = Math.min(MAX_GRABACION, Math.max(0, Math.floor(segundos)));
  return `${mmss(s)} / ${mmss(MAX_GRABACION)}`;
}

// En qué formato graba este navegador. MP4 (H.264) primero porque lo abren todos los celulares; si no, WebM.
// `soporta` es MediaRecorder.isTypeSupported. null = este navegador no puede grabar.
export function formatoGrabacion(soporta: (mime: string) => boolean): string | null {
  const opciones = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return opciones.find((m) => soporta(m)) ?? null;
}

// ---------- Detectar y elegir la cámara ----------

export type CamaraDetectada = { id: string; nombre: string };

// De todo lo que reporta el navegador (enumerateDevices), solo las cámaras que se pueden elegir.
export function camarasDe(aparatos: { kind: string; deviceId: string; label: string }[]): CamaraDetectada[] {
  const lista: CamaraDetectada[] = [];
  for (const a of aparatos) {
    if (a.kind !== "videoinput" || !a.deviceId || lista.some((c) => c.id === a.deviceId)) continue;
    lista.push({ id: a.deviceId, nombre: a.label || `Cámara ${lista.length + 1}` });
  }
  return lista;
}

// Qué se le pide al navegador: la cámara elegida por su id, o la delantera / trasera si no se ha elegido.
export function pedidoDeCamara(o: { id?: string; frente: boolean; ancho?: number; alto?: number }): Record<string, unknown> {
  const medida = { width: { ideal: o.ancho ?? 1920 }, height: { ideal: o.alto ?? 1080 } };
  if (o.id) return { deviceId: { exact: o.id }, ...medida };
  return { facingMode: o.frente ? "user" : { ideal: "environment" }, ...medida };
}

// La cámara que sigue en la lista (para el botón «Cambiar»). null = no hay otra.
export function siguienteCamara(lista: CamaraDetectada[], actual: string): string | null {
  if (lista.length === 0) return null;
  const i = lista.findIndex((c) => c.id === actual);
  if (i < 0) return lista[0].id;
  return lista.length > 1 ? lista[(i + 1) % lista.length].id : null;
}

// ¿Es la cámara de selfies? (se muestra como espejo). Manda lo que diga el navegador; si no dice, el nombre.
export function esFrontal(facingMode: string | undefined, nombre: string): boolean {
  if (facingMode) return facingMode === "user";
  return /front|frontal|delantera|selfie/i.test(nombre);
}
