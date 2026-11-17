// Verificación de NFC y pago sin contacto del celular (sin pantalla, para poder probarla).
// Una página web solo puede revisar dos cosas: si puede leer tarjetas NFC (Chrome en Android)
// y si el teléfono tiene una billetera para pagar acercándolo (Google Pay).
// Cobrar con «Tap to Pay» (aceptar tarjetas en el teléfono) solo lo hacen las apps instaladas desde la tienda.

export type Revision = { ok: boolean; label: string; help?: string };

// Resultado de intentar leer NFC. `resultado` es "ok", "SinSoporte" (el navegador no tiene NFC para páginas)
// o el name del error que dio el navegador al intentar leer.
export function revisionNfc(resultado: string): Revision {
  switch (resultado) {
    case "ok":
      return { ok: true, label: "NFC disponible y encendido", help: "Este celular puede leer y activar tarjetas NFC desde Studio." };
    case "SinSoporte":
      return {
        ok: false,
        label: "Este navegador no puede usar NFC",
        help: "El NFC desde una página solo funciona en Chrome en un celular Android. En iPhone y en computadora no está disponible.",
      };
    case "NotAllowedError":
    case "SecurityError":
      return {
        ok: false,
        label: "Falta el permiso de NFC",
        help: "Toca el candado junto a la dirección de la página, permite «NFC» y vuelve a verificar.",
      };
    case "NotReadableError":
      return {
        ok: false,
        label: "El NFC está apagado",
        help: "Enciéndelo en los ajustes del celular (Conexiones → NFC y pagos sin contacto) y vuelve a verificar.",
      };
    case "NotSupportedError":
      return { ok: false, label: "Este celular no tiene NFC", help: "Puedes activar con el código QR o escribiendo el código de la tarjeta." };
    default:
      return { ok: false, label: "No se pudo verificar el NFC", help: "Intenta de nuevo. Si sigue igual, usa el código QR o escribe el código." };
  }
}

// Resultado de preguntar por la billetera. `resultado` es "si", "no", "SinSoporte" o "error".
export function revisionPagoSinContacto(resultado: string): Revision {
  switch (resultado) {
    case "si":
      return { ok: true, label: "Pago sin contacto listo (Google Pay)", help: "Este celular puede pagar acercándolo a una terminal." };
    case "no":
      return {
        ok: false,
        label: "No hay billetera para pagar sin contacto",
        help: "Instala o configura Google Pay (Billetera de Google) con una tarjeta para pagar acercando el celular.",
      };
    case "SinSoporte":
      return { ok: false, label: "Este navegador no puede revisar el pago sin contacto", help: "Ábrelo en Chrome en un celular Android." };
    default:
      return { ok: false, label: "No se pudo revisar el pago sin contacto", help: "Intenta de nuevo en unos momentos." };
  }
}

// Lo que se le pregunta al navegador para saber si hay Google Pay (solo consulta: no cobra nada).
export const CONSULTA_GOOGLE_PAY = {
  supportedMethods: "https://google.com/pay",
  data: {
    environment: "TEST",
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [
      {
        type: "CARD",
        parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX", "DISCOVER"] },
      },
    ],
  },
};

// ¿Se muestra la tarjeta «NFC y pago sin contacto»? Solo en celulares y tabletas cuyo navegador
// tiene NFC para páginas (hoy: Chrome en Android). En computadora y en iPhone/iPad no aparece.
// `movil` es lo que dice el navegador (userAgentData.mobile) cuando lo dice.
export function mostrarVerificarNfc(o: { tieneNfc: boolean; agente: string; movil?: boolean; puntosTactiles?: number }): boolean {
  if (!o.tieneNfc) return false;
  if (o.movil) return true;
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(o.agente)) return true;
  // Tabletas que se presentan como computadora: se reconocen por la pantalla táctil
  return (o.puntosTactiles ?? 0) > 1 && /Macintosh|CrOS/i.test(o.agente);
}
