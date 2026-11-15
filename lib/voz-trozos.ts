// Voz en off de guiones largos: el servicio de voz tarda más mientras más largo es el texto, y el servidor
// corta a los 25 s. Por eso un guion largo se parte en trozos por oraciones, se piden a la vez y se unen.

export const MAX_TROZO_VOZ = 300; // letras por trozo
const MAX_TROZOS = 8;

// Parte un texto en pedazos de hasta `max` letras, cortando en el último separador que quepa.
function partir(texto: string, max: number, separador: RegExp): string[] {
  const piezas = texto.split(separador).filter((p) => p.trim());
  const salida: string[] = [];
  let actual = "";
  for (const p of piezas) {
    const pieza = p.trim();
    if (!actual) actual = pieza;
    else if (actual.length + 1 + pieza.length <= max) actual += ` ${pieza}`;
    else {
      salida.push(actual);
      actual = pieza;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

// El guion en trozos que terminan en oración completa. Un guion corto queda en uno solo.
// Si hay más trozos de los que se piden a la vez, los últimos se juntan (el servidor recorta el texto antes).
export function trozosDeGuion(guion: string, max: number = MAX_TROZO_VOZ): string[] {
  const texto = guion.replace(/\s+/g, " ").trim();
  if (!texto) return [];
  if (texto.length <= max) return [guion.trim()];
  // Oraciones: se corta después de . ! ? … seguidos de espacio
  const oraciones = texto.split(/(?<=[.!?…])\s+/);
  const trozos: string[] = [];
  let actual = "";
  const cerrar = () => {
    if (actual) trozos.push(actual);
    actual = "";
  };
  for (const o of oraciones) {
    if (o.length > max) {
      // Una oración enorme: por comas y, si aún no cabe, por espacios (nunca a media palabra)
      cerrar();
      for (const parte of partir(o, max, /(?<=[,;:])\s+/)) {
        if (parte.length <= max) trozos.push(parte);
        else trozos.push(...partir(parte, max, /\s+/));
      }
    } else if (!actual) actual = o;
    else if (actual.length + 1 + o.length <= max) actual += ` ${o}`;
    else {
      cerrar();
      actual = o;
    }
  }
  cerrar();
  if (trozos.length <= MAX_TROZOS) return trozos;
  return [...trozos.slice(0, MAX_TROZOS - 1), trozos.slice(MAX_TROZOS - 1).join(" ")];
}

// Quita la etiqueta ID3 del inicio de un MP3 (texto informativo, no audio). Unir audios con una etiqueta
// en medio confunde a algunos reproductores.
export function sinEtiquetaId3(mp3: Buffer): Buffer {
  if (mp3.length < 10 || mp3[0] !== 0x49 || mp3[1] !== 0x44 || mp3[2] !== 0x33) return mp3;
  const largo = ((mp3[6] & 0x7f) << 21) | ((mp3[7] & 0x7f) << 14) | ((mp3[8] & 0x7f) << 7) | (mp3[9] & 0x7f);
  const fin = 10 + largo;
  return fin <= mp3.length ? mp3.subarray(fin) : mp3;
}

// Une varios MP3 en uno, en orden.
export function unirMp3(partes: Buffer[]): Buffer {
  return Buffer.concat(partes.map((p, i) => (i === 0 ? p : sinEtiquetaId3(p))));
}
