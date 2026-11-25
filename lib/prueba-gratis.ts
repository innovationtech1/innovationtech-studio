// Duración de la prueba gratis de una cuenta nueva. Sin servidor ni pantalla: lo usan el panel de
// administrador, la ruta que lo guarda y la pantalla «sin plan», y se prueba solo.

// Las únicas duraciones que ofrece el panel (en días)
export const DIAS_PRUEBA = [7, 15, 30] as const;
export type DiasPrueba = (typeof DIAS_PRUEBA)[number];

const MINUTOS_DIA = 1440;

export const esDiasPrueba = (v: unknown): v is DiasPrueba => (DIAS_PRUEBA as readonly unknown[]).includes(v);

export const minutosDePrueba = (dias: DiasPrueba): number => dias * MINUTOS_DIA;

// Los minutos guardados en la configuración, como una de las opciones del panel; null si no coincide
// con ninguna (por ejemplo los 10 minutos de fábrica).
export function diasDePrueba(minutos: number): DiasPrueba | null {
  return DIAS_PRUEBA.find((d) => minutosDePrueba(d) === minutos) ?? null;
}

// En la app de Google Play no se venden planes: a quien se le acabó la prueba no se le invita a elegir
// ni a comprar, solo se le dice qué pasó (lib/app-play.ts).
export const TITULO_SIN_PLAN_PLAY = "Tu prueba terminó";
export const TEXTO_SIN_PLAN_PLAY = "Esta cuenta no tiene un plan activo. Desde esta app no se contratan ni se cambian planes.";
