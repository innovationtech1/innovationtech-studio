// Sonido de los videos propios dentro del reel. Módulo puro: solo cuentas, sin audio de verdad.

export const FUNDIDO = 0.15; // segundos de entrada y de salida del sonido de un clip (para que no truene)
const ESPERA_VOZ = 0.3; // la voz en off arranca 0.3 s después del video
const HUECO = 1; // si entre dos sonidos hay menos de esto, la música no sube y baja: se queda abajo

export type Tramo = { desde: number; hasta: number };

// Volumen (0 a 1) del sonido de un clip en el segundo `t` de su escena, que dura `dura`.
export function gananciaClip(t: number, dura: number): number {
  if (!(dura > 0) || t < 0 || t > dura) return 0;
  const f = Math.min(FUNDIDO, dura / 2);
  return Math.max(0, Math.min(1, t / f, (dura - t) / f));
}

// En qué partes del video suena un video propio. Los que van seguidos forman un solo tramo.
export function tramosConSonido(escenas: { segundos: number; video?: { sonido: boolean } }[]): Tramo[] {
  const tramos: Tramo[] = [];
  let t = 0;
  for (const e of escenas) {
    if (e.video?.sonido) {
      const ultimo = tramos[tramos.length - 1];
      if (ultimo && ultimo.hasta === t) ultimo.hasta = t + e.segundos;
      else tramos.push({ desde: t, hasta: t + e.segundos });
    }
    t += e.segundos;
  }
  return tramos;
}

// Cuándo baja la música: mientras habla la voz en off y mientras suena un video propio.
export function bajadasDeMusica(segundosVoz: number | null, clips: Tramo[]): Tramo[] {
  const todos = [...(segundosVoz && segundosVoz > 0 ? [{ desde: ESPERA_VOZ, hasta: ESPERA_VOZ + segundosVoz }] : []), ...clips.map((c) => ({ ...c }))].sort(
    (a, b) => a.desde - b.desde,
  );
  const juntos: Tramo[] = [];
  for (const x of todos) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && x.desde - ultimo.hasta < HUECO) ultimo.hasta = Math.max(ultimo.hasta, x.hasta);
    else juntos.push(x);
  }
  return juntos;
}
