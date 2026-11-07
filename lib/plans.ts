// Reglas de planes: qué herramientas y cuántos usos diarios tiene cada plan,
// y si un negocio puede usar la plataforma ahora mismo.
// Son funciones "puras": no leen ni guardan nada, solo calculan. Por eso
// son fáciles de probar.

export type Plan = "prueba" | "basico" | "pro";

export type Herramienta =
  | "textos"
  | "asistente"
  | "imagenes"
  | "editor_imagenes"
  | "planeacion"
  | "musica"
  | "reels"
  | "editor_video"
  | "voz"
  | "subtitulos"
  | "video_ia";

// Cosas que se cuentan por día.
export type Contador = "textos" | "imagenes" | "voces" | "subtitulos";

export type PlanesConfig = {
  precios: Record<"basico" | "pro", { monto: number; stripePriceId?: string }>;
  herramientas: Record<Plan, Herramienta[]>;
  limites: Record<Plan, Record<Contador, number>>;
  personas: Record<"basico" | "pro", number>;
  pruebaMinutos: number;
};

const BASE: Herramienta[] = [
  "textos",
  "asistente",
  "imagenes",
  "editor_imagenes",
  "planeacion",
  "musica",
];
const AVANZADAS: Herramienta[] = ["reels", "editor_video", "voz", "subtitulos"];

export const DEFAULT_CONFIG: PlanesConfig = {
  precios: { basico: { monto: 19 }, pro: { monto: 39 } }, // USD al mes
  herramientas: {
    prueba: [...BASE, ...AVANZADAS],
    basico: [...BASE],
    pro: [...BASE, ...AVANZADAS, "video_ia"],
  },
  limites: {
    prueba: { textos: 10, imagenes: 3, voces: 2, subtitulos: 2 },
    basico: { textos: 60, imagenes: 20, voces: 0, subtitulos: 0 },
    pro: { textos: 200, imagenes: 60, voces: 30, subtitulos: 30 },
  },
  personas: { basico: 1, pro: 3 },
  pruebaMinutos: 10,
};

// Fechas en milisegundos.
export type Negocio = {
  id: string;
  nombre: string;
  duenoUid: string;
  miembros: string[];
  plan: "basico" | "pro" | null;
  estado: "prueba" | "activo" | "pausado";
  pruebaHasta?: number;
  origen: "stripe" | "manual" | null;
  pagadoHasta?: number;
  stripe?: {
    customerId?: string;
    subscriptionId?: string;
    status?: string;
    priceId?: string;
    ultimoEvento?: number;
  };
  creado: number;
  actualizado: number;
};

export type Efectivo = {
  estado: "prueba" | "activo" | "pausado" | "sin_plan";
  plan: Plan | null;
};

// Estado real del negocio en este momento. El orden de las reglas importa.
export function estadoEfectivo(n: Negocio, ahora: number): Efectivo {
  // 1) Pausado a mano: manda sobre todo lo demás.
  if (n.estado === "pausado") return { estado: "pausado", plan: n.plan };

  // 2) Prueba: vigente o vencida.
  if (n.estado === "prueba") {
    if (n.pruebaHasta !== undefined && ahora > n.pruebaHasta) {
      return { estado: "sin_plan", plan: null };
    }
    return { estado: "prueba", plan: "prueba" };
  }

  // 3) Pago manual vencido.
  if (n.origen === "manual" && n.pagadoHasta !== undefined && ahora > n.pagadoHasta) {
    return { estado: "pausado", plan: n.plan };
  }

  // 4) Suscripción de Stripe: solo "active" y "trialing" cuentan como al día.
  if (n.origen === "stripe") {
    const ok = n.stripe?.status === "active" || n.stripe?.status === "trialing";
    return { estado: ok ? "activo" : "pausado", plan: n.plan };
  }

  // 5) En cualquier otro caso, el estado guardado.
  return { estado: n.estado, plan: n.plan };
}

export function puedeUsar(cfg: PlanesConfig, plan: Plan, h: Herramienta): boolean {
  return cfg.herramientas[plan].includes(h);
}

export function limite(cfg: PlanesConfig, plan: Plan, c: Contador): number {
  return cfg.limites[plan][c];
}

// Día de los contadores (AAAA-MM-DD) en la hora de Chicago.
const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" });
export function diaChicago(ahora: number): string {
  return formatoDia.format(ahora);
}

// Pone lo guardado encima de DEFAULT_CONFIG; lo que falte se queda con el valor por defecto.
// Siempre arma un objeto nuevo, para que nadie modifique DEFAULT_CONFIG por accidente.
export function mezclarConfig(g: Partial<PlanesConfig> | null | undefined): PlanesConfig {
  const guardada = g ?? {};
  const d = DEFAULT_CONFIG;
  return {
    precios: {
      basico: { ...d.precios.basico, ...guardada.precios?.basico },
      pro: { ...d.precios.pro, ...guardada.precios?.pro },
    },
    herramientas: {
      prueba: [...(guardada.herramientas?.prueba ?? d.herramientas.prueba)],
      basico: [...(guardada.herramientas?.basico ?? d.herramientas.basico)],
      pro: [...(guardada.herramientas?.pro ?? d.herramientas.pro)],
    },
    limites: {
      prueba: { ...d.limites.prueba, ...guardada.limites?.prueba },
      basico: { ...d.limites.basico, ...guardada.limites?.basico },
      pro: { ...d.limites.pro, ...guardada.limites?.pro },
    },
    personas: { ...d.personas, ...guardada.personas },
    pruebaMinutos: guardada.pruebaMinutos ?? d.pruebaMinutos,
  };
}
