import type { Contador, PaqueteId, Saldo } from "./plans";

// Avisos del uso del mes y textos de los paquetes. Funciones puras: se usan en el navegador
// (Mi cuenta y el aviso del 80%) y se prueban sin pantalla.

const ORDEN: Contador[] = ["textos", "imagenes", "voces", "subtitulos"];

// Contadores con tope (> 0) que ya llegaron al 80% de lo incluido en el mes.
// Se compara con enteros (uso × 5 ≥ tope × 4) para no depender de decimales.
export function contadoresEnAviso(uso: Record<Contador, number>, limites: Record<Contador, number>): Contador[] {
  return ORDEN.filter((c) => {
    const tope = limites[c] ?? 0;
    return tope > 0 && (uso[c] ?? 0) * 5 >= tope * 4;
  });
}

// Clave de localStorage para mostrar el aviso del 80% una sola vez por contador y mes (AAAA-MM).
export const claveAviso80 = (mes: string, c: Contador) => `its-aviso-80-${mes}-${c}`;

const NOMBRE_AVISO: Record<Contador, string> = {
  textos: "mensajes y textos",
  imagenes: "imágenes",
  voces: "voces",
  subtitulos: "subtítulos",
};
export const textoAviso80 = (c: Contador) => `Ya usaste el 80% de tus ${NOMBRE_AVISO[c]} de este mes.`;

const NOMBRE_PAQUETE: Record<PaqueteId, string> = { creativo: "Creativo", voz: "Voz" };
const NOMBRE_CORTO: Record<Contador, string> = {
  textos: "textos",
  imagenes: "imágenes",
  voces: "voces",
  subtitulos: "subtítulos",
};

// «Creativo · +500 textos y +150 imágenes · $5», armado con lo que hoy trae el paquete.
export function textoPaquete(id: PaqueteId, monto: number, contenido: Saldo): string {
  const partes = ORDEN.filter((c) => (contenido[c] ?? 0) > 0).map((c) => `+${contenido[c]} ${NOMBRE_CORTO[c]}`);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes.join("");
  return `${NOMBRE_PAQUETE[id]} · ${lista} · $${monto}`;
}
