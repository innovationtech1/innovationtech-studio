// Reglas de planes: qué herramientas y cuántos usos mensuales tiene cada plan,
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

// Cosas que se cuentan por mes.
export type Contador = "textos" | "imagenes" | "voces" | "subtitulos" | "tomas_ia";
export const CONTADORES: Contador[] = ["textos", "imagenes", "voces", "subtitulos", "tomas_ia"];

// Usos extra comprados (saldo de paquetes). Solo aparecen los contadores con saldo.
export type Saldo = Partial<Record<Contador, number>>;

// Paquetes prepagados que se compran una sola vez.
export type PaqueteId = "creativo" | "voz" | "video";
export const PAQUETES: PaqueteId[] = ["creativo", "voz", "video"];

// Video con IA (tomas de 5 s generadas en fal.ai). Todo editable en la configuración.
export type NivelModelo = "demo" | "estandar";
export type ModeloVideo = { id: string; centavosPorSegundo: number };
export type ConfigVideoIa = {
  modelos: Record<NivelModelo, ModeloVideo>;
  segundosToma: number;
  topeDiarioCentavos: number; // tope de gasto de todo Studio por día (hora de Chicago)
  umbralDemo: number; // la prueba se pausa al llegar a esta parte del tope (0.8 = 80%)
  simultaneos: number; // trabajos al mismo tiempo en fal.ai
  minutosAtorado: number;
  maxIntentos: number;
};

export type PaqueteConfig = {
  monto: number; // USD
  contenido: Saldo; // lo que suma el paquete
  planes: ("basico" | "pro")[]; // planes que pueden comprarlo
  stripePriceId?: string;
};

export type PlanesConfig = {
  precios: Record<"basico" | "pro", { monto: number; stripePriceId?: string }>;
  herramientas: Record<Plan, Herramienta[]>;
  limitesMes: Record<Plan, Record<Contador, number>>;
  paquetes: Record<PaqueteId, PaqueteConfig>;
  personas: Record<"basico" | "pro", number>;
  pruebaMinutos: number;
  videoIa: ConfigVideoIa;
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
    prueba: [...BASE, ...AVANZADAS, "video_ia"],
    basico: [...BASE, "video_ia"],
    pro: [...BASE, ...AVANZADAS, "video_ia"],
  },
  limitesMes: {
    prueba: { textos: 10, imagenes: 3, voces: 2, subtitulos: 2, tomas_ia: 1 },
    basico: { textos: 1000, imagenes: 300, voces: 0, subtitulos: 0, tomas_ia: 0 },
    pro: { textos: 3000, imagenes: 1000, voces: 250, subtitulos: 250, tomas_ia: 20 },
  },
  paquetes: {
    creativo: { monto: 5, contenido: { textos: 500, imagenes: 150 }, planes: ["basico", "pro"] },
    voz: { monto: 9, contenido: { voces: 100, subtitulos: 100 }, planes: ["pro"] },
    video: { monto: 15, contenido: { tomas_ia: 20 }, planes: ["basico", "pro"] },
  },
  personas: { basico: 1, pro: 3 },
  pruebaMinutos: 10,
  videoIa: {
    modelos: {
      demo: { id: "fal-ai/wan-25-preview/image-to-video", centavosPorSegundo: 5 },
      estandar: { id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", centavosPorSegundo: 7 },
    },
    segundosToma: 5,
    topeDiarioCentavos: 500,
    umbralDemo: 0.8,
    simultaneos: 3,
    minutosAtorado: 15,
    maxIntentos: 2,
  },
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
  paquetes?: Saldo; // saldo de paquetes comprados
  stripe?: {
    customerId?: string;
    subscriptionId?: string;
    status?: string;
    priceId?: string;
    ultimoEvento?: number; // reloj de los avisos de suscripción (ms)
    ultimaFactura?: number; // reloj de los avisos de factura (ms)
    checkoutPendiente?: string; // id de la última sesión de pago abierta (para no cobrar dos veces)
    livemode?: boolean; // true = cobro real; false = modo de prueba de Stripe (tarjetas de prueba)
    finPeriodo?: number; // fin del mes ya pagado con tarjeta (ms), de items.data[0].current_period_end
    // La suscripción volvió a renovar (cancel_at_period_end: false) con un pago a mano pendiente: revisar
    renovoConManual?: boolean;
  };
  // De tarjeta a pago a mano: cuando termine el mes pagado con tarjeta (aviso de suscripción
  // borrada), el negocio pasa a pago a mano con este plan hasta esta fecha (ms).
  manualSiguiente?: { plan: "basico" | "pro"; hasta: number };
  // Cuenta de Cloudflare propia del negocio. Solo datos para mostrar: la clave va cifrada aparte
  // (colección claves_ia); aquí nunca el token ni el Account ID completo.
  iaPropia?: { cuentaFin: string; conectada: number };
  creado: number;
  actualizado: number;
};

// Campos que se pueden borrar del negocio: en los cambios, null quiere decir «borrar el campo».
// (En los demás campos null es un valor normal, p. ej. plan: null.)
export const CAMPOS_BORRABLES = ["manualSiguiente", "iaPropia"] as const;
type Borrable = (typeof CAMPOS_BORRABLES)[number];

// Cambios para guardar en un negocio (como Partial<Negocio>, pero null borra los campos borrables).
export type CambiosNegocio = Omit<Partial<Negocio>, Borrable> & { [K in Borrable]?: Negocio[K] | null };

// Aplica los cambios a una copia del negocio (así lo hace la base en memoria y las pruebas).
export function aplicarCambios(n: Negocio, c: CambiosNegocio): Negocio {
  const r = { ...n, ...c } as Record<string, unknown>;
  for (const k of CAMPOS_BORRABLES) if (r[k] === null) delete r[k];
  return r as Negocio;
}

export type Efectivo = {
  estado: "prueba" | "activo" | "pausado" | "sin_plan";
  plan: Plan | null;
};

export type OpcionesEfectivo = {
  // Modo de las claves de Stripe que usa el servidor ahora (true = reales). Si se pasa, una
  // suscripción guardada del otro modo no cuenta: hay que pagar de nuevo en el modo actual.
  stripeLive?: boolean;
};

// Estado real del negocio en este momento. El orden de las reglas importa.
export function estadoEfectivo(n: Negocio, ahora: number, opts: OpcionesEfectivo = {}): Efectivo {
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
    // Una suscripción del otro modo (p. ej. pagada con tarjeta de prueba) no da plan
    const guardado = n.stripe?.livemode;
    if (opts.stripeLive !== undefined && guardado !== undefined && guardado !== opts.stripeLive) {
      return { estado: "sin_plan", plan: null };
    }
    const ok = n.stripe?.status === "active" || n.stripe?.status === "trialing";
    if (ok) return { estado: "activo", plan: n.plan };
    // Lo pagado a mano sigue cubriendo hasta su fecha aunque ya haya pasado a tarjeta
    // (p. ej. status todavía sin llegar después del Checkout, o canceló la prueba).
    if (n.pagadoHasta !== undefined && n.pagadoHasta > ahora) return { estado: "activo", plan: n.plan };
    return { estado: "pausado", plan: n.plan };
  }

  // 5) En cualquier otro caso, el estado guardado.
  return { estado: n.estado, plan: n.plan };
}

// Margen mínimo para pasar de pago a mano a tarjeta: con menos, mejor esperar a que venza.
// Stripe exige que trial_end quede al menos 48 h después según su propio reloj y después de
// nuestras llamadas, así que se piden 10 minutos de más.
export const VENTANA_PASAR_A_TARJETA = 48 * 60 * 60 * 1000;
export const MARGEN_RELOJ_STRIPE = 10 * 60 * 1000;

// Suscripciones de Stripe que todavía pueden cobrar: no se debe abrir otra encima.
export const SUSCRIPCION_VIVA: ReadonlySet<string> = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

// ¿Queda tiempo para que Stripe acepte la prueba (trial_end) hasta que vence lo pagado en efectivo?
export function quedaMargenParaTarjeta(pagadoHasta: number, ahora: number): boolean {
  return pagadoHasta - ahora >= VENTANA_PASAR_A_TARJETA + MARGEN_RELOJ_STRIPE;
}

// ¿Lo pagado en efectivo sigue cubriendo y no hay una suscripción que cobre?
// (pago a mano, o ya pasó a tarjeta pero la suscripción no sigue viva, p. ej. canceló la prueba).
// Con tarjeta se mira el status guardado; pagarPlan además le pregunta a Stripe.
export function cubiertoPorEfectivo(n: Negocio, ahora: number): boolean {
  if (n.pagadoHasta === undefined || n.pagadoHasta <= ahora) return false;
  if (n.origen === "manual") return true;
  return n.origen === "stripe" && !SUSCRIPCION_VIVA.has(n.stripe?.status ?? "");
}

// ¿Puede el negocio pasar (o volver) a tarjeta ahora? El primer cobro sería al vencer lo pagado.
export function pasarATarjetaDisponible(n: Negocio, ahora: number): boolean {
  return (
    cubiertoPorEfectivo(n, ahora) &&
    n.estado !== "pausado" &&
    n.pagadoHasta !== undefined &&
    quedaMargenParaTarjeta(n.pagadoHasta, ahora)
  );
}

export function puedeUsar(cfg: PlanesConfig, plan: Plan, h: Herramienta): boolean {
  return cfg.herramientas[plan].includes(h);
}

export function limiteMes(cfg: PlanesConfig, plan: Plan, c: Contador): number {
  return cfg.limitesMes[plan][c];
}

export function esPaquete(x: unknown): x is PaqueteId {
  return x === "creativo" || x === "voz" || x === "video";
}

// Modelo de video según el plan: la prueba usa el económico.
export function modeloDePlan(plan: Plan): NivelModelo {
  return plan === "prueba" ? "demo" : "estandar";
}

// Lugar en la fila: 1 = Pro con lo incluido en el mes, 2 = con saldo de paquete, 3 = prueba.
export function prioridadToma(plan: Plan, usaSaldo: boolean): 1 | 2 | 3 {
  if (plan === "prueba") return 3;
  return plan === "pro" && !usaSaldo ? 1 : 2;
}

// Lo que cuesta una toma (centavos de dólar), para el control de gasto.
export function costoTomaCentavos(cfg: PlanesConfig, nivel: NivelModelo): number {
  return Math.round(cfg.videoIa.modelos[nivel].centavosPorSegundo * cfg.videoIa.segundosToma);
}

// El movimiento que pide el cliente, parejo para comparar (caché): minúsculas, espacios simples, máx. 300.
export function normalizarMovimiento(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300).trim();
}

// Reparte `unidades` entre lo que queda del mes y el saldo de paquetes (primero el mes).
// Devuelve null si no alcanza. Si el admin bajó el tope y ya se pasó, el mes aporta 0.
export function repartirReserva(
  usadoMes: number,
  tope: number,
  saldo: number,
  unidades: number,
): { delMes: number; delSaldo: number } | null {
  const quedaMes = Math.max(0, tope - usadoMes);
  const delMes = Math.min(quedaMes, unidades);
  const delSaldo = unidades - delMes;
  if (delSaldo > saldo) return null;
  return { delMes, delSaldo };
}

// Una cantidad guardada (p. ej. el saldo en Firestore) como entero seguro: 0 o más.
// Un texto con número ("100") se acepta; cualquier otra cosa (vacío, NaN, negativo) cuenta como 0.
export function cantidadSegura(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

// Suma (signo 1) o resta (signo -1) un saldo. Nunca baja de 0 y quita los contadores en 0.
export function sumarSaldo(saldo: Saldo | undefined, mas: Saldo, signo: 1 | -1): Saldo {
  const r: Saldo = { ...saldo };
  for (const [k, v] of Object.entries(mas) as [Contador, unknown][]) {
    const nuevo = Math.max(0, cantidadSegura(r[k]) + signo * cantidadSegura(v));
    if (nuevo > 0) r[k] = nuevo;
    else delete r[k];
  }
  return r;
}

// Mes de los contadores (AAAA-MM) en la hora de Chicago.
export function mesChicago(ahora: number): string {
  return diaChicago(ahora).slice(0, 7);
}

// Busca el instante en que en Chicago el reloj marca exactamente esa hora, ese día.
// Chicago va 5 h (verano) o 6 h (invierno) detrás de UTC: se prueba cuál coincide.
// Se comparan las partes (año, mes, día, hora…) y no el texto, que depende de cómo se formatea.
// Devuelve NaN si ninguna coincide (p. ej. una hora que no existe por el cambio de horario).
export function instanteChicago(y: number, mes: number, d: number, h: number, min: number, s: number): number {
  const base = Date.UTC(y, mes - 1, d, h, min, s);
  const reloj = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const dos = (n: number) => String(n).padStart(2, "0");
  const esperado = {
    year: String(y),
    month: dos(mes),
    day: dos(d),
    hour: dos(h),
    minute: dos(min),
    second: dos(s),
  };
  for (const horas of [5, 6]) {
    const t = base + horas * 3600_000;
    const p = Object.fromEntries(reloj.formatToParts(t).map((x) => [x.type, x.value]));
    if (Object.entries(esperado).every(([k, v]) => p[k] === v)) return t;
  }
  return Number.NaN;
}

// Medianoche de Chicago del día 1 del mes siguiente (cuando se reinician los contadores), en ms.
export function inicioMesSiguienteChicago(ahora: number): number {
  const [y, m] = mesChicago(ahora).split("-").map(Number);
  return m === 12 ? instanteChicago(y + 1, 1, 1, 0, 0, 0) : instanteChicago(y, m + 1, 1, 0, 0, 0);
}

// Día de los contadores (AAAA-MM-DD) en la hora de Chicago.
// Se arma con las partes (año, mes, día) para no depender de cómo se escribe la fecha.
const formatoDia = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function diaChicago(ahora: number): string {
  const p = Object.fromEntries(formatoDia.formatToParts(ahora).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// Mezcla un paquete: monto y precio de Stripe pueden cambiar; `contenido` y `planes`
// solo se toman de lo guardado si vienen completos, si no se queda el valor por defecto.
function mezclarPaquete(d: PaqueteConfig, g: Partial<PaqueteConfig> | undefined): PaqueteConfig {
  const contenidoCompleto = g?.contenido && Object.keys(d.contenido).every((k) => k in g.contenido!);
  return {
    ...d,
    ...g,
    contenido: { ...(contenidoCompleto ? g!.contenido : d.contenido) },
    planes: [...(Array.isArray(g?.planes) && g.planes.length > 0 ? g.planes : d.planes)],
  };
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
    limitesMes: {
      prueba: { ...d.limitesMes.prueba, ...guardada.limitesMes?.prueba },
      basico: { ...d.limitesMes.basico, ...guardada.limitesMes?.basico },
      pro: { ...d.limitesMes.pro, ...guardada.limitesMes?.pro },
    },
    paquetes: {
      creativo: mezclarPaquete(d.paquetes.creativo, guardada.paquetes?.creativo),
      voz: mezclarPaquete(d.paquetes.voz, guardada.paquetes?.voz),
      video: mezclarPaquete(d.paquetes.video, guardada.paquetes?.video),
    },
    personas: { ...d.personas, ...guardada.personas },
    pruebaMinutos: guardada.pruebaMinutos ?? d.pruebaMinutos,
    videoIa: {
      ...d.videoIa,
      ...guardada.videoIa,
      modelos: {
        demo: { ...d.videoIa.modelos.demo, ...guardada.videoIa?.modelos?.demo },
        estandar: { ...d.videoIa.modelos.estandar, ...guardada.videoIa?.modelos?.estandar },
      },
    },
  };
}
