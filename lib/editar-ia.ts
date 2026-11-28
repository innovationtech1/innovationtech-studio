// «Editar con IA»: la persona le dice a NOVA qué cambiar de su foto con sus palabras.
// Aquí vive lo que se puede probar sin pantalla: entender el pedido, elegir el tamaño y armar la instrucción.
// Etapa 1: borrar, cambiar y extender con FLUX.2 klein de Cloudflare. «Mejorar la calidad» llega en la etapa 2.

export type TipoEdicion = "borrar" | "cambiar" | "extender" | "mejorar";
export type FormatoExtension = "1:1" | "4:5" | "9:16" | "16:9";

// El modelo solo acepta fotos de referencia de menos de 512×512.
export const LADO_EDITAR = 511;
const PEDIDO_MAXIMO = 300;
const FOTO_MAXIMA = 1_200_000; // caracteres de la foto ya achicada; de sobra para 511 px

export const TAMANOS_EXTENSION: Record<FormatoExtension, [number, number]> = {
  "1:1": [1024, 1024],
  "4:5": [896, 1120],
  "9:16": [768, 1344],
  "16:9": [1344, 768],
};

export const EJEMPLOS_EDICION = ["Quita la servilleta de la mesa", "Pon el fondo de una playa", "Hazla vertical para historia", "Cambia el fondo a blanco"];

export function limpiarPedido(t: unknown): string {
  if (typeof t !== "string") return "";
  return t.replace(/\s+/g, " ").trim().slice(0, PEDIDO_MAXIMO);
}

const ES_MEJORAR = /calidad|n[ií]tid|pixel|borros|resoluci|upscale|enhance|sharp|quality|\bhd\b/i;
const ES_EXTENDER = /extiend|extend|ampl[ií]|expand|vertical|horizontal|cuadrad|square|historia|stories|story|\breel|tiktok|m[aá]s espacio|more space|m[aá]s (ancha|alta)|\bwide/i;
const ES_BORRAR = /\b(quita|quitar|quitale|quítale|borra|borrar|elimina|eliminar|remueve|remover|saca|sacar|remove|erase|delete)\b/i;

export function clasificarEdicion(texto: string): TipoEdicion {
  if (ES_MEJORAR.test(texto)) return "mejorar";
  if (ES_EXTENDER.test(texto)) return "extender";
  if (ES_BORRAR.test(texto)) return "borrar";
  return "cambiar";
}

export function formatoDeExtension(texto: string, ancho: number, alto: number): FormatoExtension {
  if (/vertical|historia|stories|story|\breel|tiktok/i.test(texto)) return "9:16";
  if (/cuadrad|square/i.test(texto)) return "1:1";
  if (/horizontal|youtube|paisaje|landscape|\bwide|m[aá]s ancha/i.test(texto)) return "16:9";
  if (/4:5|feed|retrato|portrait/i.test(texto)) return "4:5";
  return alto / ancho > 1.5 ? "1:1" : "9:16";
}

// Tamaño de la imagen que entrega el modelo: misma proporción que la foto, lado largo entre 768 y 1344,
// en múltiplos de 16 y nunca por debajo de 256 (lo mínimo que acepta).
export function tamanoSalida(ancho: number, alto: number): [number, number] {
  if (!(ancho > 0) || !(alto > 0) || !Number.isFinite(ancho) || !Number.isFinite(alto)) return [1024, 1024];
  const largo = Math.min(1344, Math.max(768, Math.max(ancho, alto)));
  const k = largo / Math.max(ancho, alto);
  const a16 = (n: number) => Math.min(1344, Math.max(256, Math.round((n * k) / 16) * 16));
  return [a16(ancho), a16(alto)];
}

export type PlanEdicion = { tipo: TipoEdicion; formato?: FormatoExtension; ancho: number; alto: number };

export function planDeEdicion(pedido: string, ancho: number, alto: number): PlanEdicion {
  const tipo = clasificarEdicion(pedido);
  if (tipo === "extender") {
    const formato = formatoDeExtension(pedido, ancho, alto);
    const [w, h] = TAMANOS_EXTENSION[formato];
    return { tipo, formato, ancho: w, alto: h };
  }
  const [w, h] = tamanoSalida(ancho, alto);
  return { tipo, ancho: w, alto: h };
}

// La instrucción que recibe el modelo. El pedido va tal cual lo escribió la persona.
export function instruccionEdicion(tipo: TipoEdicion, pedido: string): string {
  const dicho = `The user's request (it may be written in Spanish): "${pedido}".`;
  const igual = "Keep everything else exactly as in the original photo: same subject, same objects, same colors, same lighting and same framing. Photorealistic result. Do not add any text, logos or watermarks.";
  if (tipo === "extender")
    return `Extend this photo to fill the whole new frame, continuing the background and surroundings naturally beyond the original edges. Keep the original subject unchanged and fully visible. ${dicho} Photorealistic result. Do not add any text, logos, watermarks or new objects.`;
  if (tipo === "borrar") return `Remove from this photo what the user asks, and fill that area naturally with the surrounding background. ${dicho} ${igual}`;
  return `Edit this photo following the user's request. ${dicho} ${igual}`;
}

export type EdicionValida =
  | { ok: true; foto: string; pedido: string; plan: PlanEdicion }
  | { ok: false; error: string; codigo?: "PRONTO" };

export const AVISO_PRONTO = "Mejorar la calidad llega muy pronto. Por ahora puedo quitar algo, cambiar algo o extender la imagen.";

export function validarEdicion(cuerpo: unknown): EdicionValida {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  const foto = typeof c.foto === "string" ? c.foto : "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(foto)) return { ok: false, error: "Falta la foto que quieres editar." };
  if (foto.length > FOTO_MAXIMA) return { ok: false, error: "La foto pesa demasiado para editarla. Prueba con otra." };
  const pedido = limpiarPedido(c.pedido);
  if (!pedido) return { ok: false, error: "Dime qué quieres cambiar de la foto." };
  const plan = planDeEdicion(pedido, Number(c.ancho), Number(c.alto));
  if (plan.tipo === "mejorar") return { ok: false, error: AVISO_PRONTO, codigo: "PRONTO" };
  return { ok: true, foto, pedido, plan };
}

export type MomentoEdicion =
  | { paso: "pedir" }
  | { paso: "trabajando"; tipo: TipoEdicion; lento?: boolean }
  | { paso: "listo" }
  | { paso: "pronto" }
  | { paso: "error"; error: string };

export function mensajeNovaEdicion(m: MomentoEdicion): string {
  if (m.paso === "pedir") return "Dime con tus palabras qué quieres cambiar de la foto. Puedo quitar algo, cambiar algo o extenderla a otro formato.";
  if (m.paso === "trabajando") {
    if (m.lento) return "Está tardando más de lo normal. Puedes esperar un poco más o volver a empezar.";
    if (m.tipo === "borrar") return "Estoy quitando eso de la foto…";
    if (m.tipo === "extender") return "Estoy extendiendo la imagen…";
    return "Estoy haciendo el cambio…";
  }
  if (m.paso === "listo") return "Listo. Desliza para comparar el antes y el después. Si te gusta, úsala; si no, pídemelo de otra forma.";
  if (m.paso === "pronto") return AVISO_PRONTO;
  return `${m.error} Puedes volver a intentarlo.`;
}
