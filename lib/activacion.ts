// Activación de Studio con tarjeta (NFC, QR o código escrito). Lógica sin pantalla, para poder probarla.
// La tarjeta trae un enlace como https://innovationtech-studio.netlify.app/activar?c=ABCD2345
// grabado en el chip NFC y en el código QR, y el mismo código impreso para escribirlo a mano.

export const LARGO_CODIGO = 8;
// Sin letras ni números que se confunden al leerlos impresos (0/O, 1/I)
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Lo que la persona escribe, sin espacios ni guiones y en mayúsculas: «abcd-2345» → «ABCD2345»
export function limpiarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codigoValido(codigo: string): boolean {
  return codigo.length === LARGO_CODIGO && [...codigo].every((c) => LETRAS.includes(c));
}

// Como se muestra y se imprime: ABCD-2345
export function mostrarCodigo(codigo: string): string {
  const c = limpiarCodigo(codigo);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

// El código que trae lo leído de la tarjeta: el enlace del chip o del QR (?c=...), o el código tal cual.
// null = ahí no hay un código de activación.
export function codigoDe(leido: string): string | null {
  const texto = leido.trim();
  if (!texto) return null;
  let candidato = texto;
  if (/^https?:\/\//i.test(texto)) {
    try {
      const u = new URL(texto);
      candidato = u.searchParams.get("c") ?? "";
    } catch {
      return null;
    }
  }
  const codigo = limpiarCodigo(candidato);
  return codigoValido(codigo) ? codigo : null;
}

// El enlace que se graba en la tarjeta para un código
export function enlaceActivacion(sitio: string, codigo: string): string {
  return `${sitio.replace(/\/+$/, "")}/activar?c=${limpiarCodigo(codigo)}`;
}

// El $cashtag de Cash App de InnovationTECH (dato público: es el que se le da al cliente para pagar).
// La variable NEXT_PUBLIC_CASHAPP_TAG, si está puesta, manda sobre este.
export const CASHTAG_INNOVATIONTECH = "$lilhector210";

// Enlace para pagar por Cash App a un $cashtag. null = el cashtag no está configurado o está mal escrito.
export function enlaceCashApp(cashtag: string | undefined): string | null {
  const tag = (cashtag ?? "").trim().replace(/^\$/, "");
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(tag)) return null;
  return `https://cash.app/$${tag}`;
}

// WhatsApp de InnovationTECH con el mensaje ya escrito para pedir la activación
export const WHATSAPP_INNOVATIONTECH = "12109900532";
export function enlaceWhatsAppActivacion(codigo: string): string {
  const mensaje = `Hola, quiero activar mi tarjeta de InnovationTECH Studio. Mi código es ${mostrarCodigo(codigo)}.`;
  return `https://wa.me/${WHATSAPP_INNOVATIONTECH}?text=${encodeURIComponent(mensaje)}`;
}
