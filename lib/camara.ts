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
