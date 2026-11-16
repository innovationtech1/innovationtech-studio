// Estilos de voz gratis, hechos en el propio aparato (Web Audio): se aplican a cualquier voz Aura, tanto a la
// voz de NOVA como a la voz en off del reel. «Natural» deja el audio como llegó. Sin llamadas a ningún servicio.
// La parte pura (parámetros, WAV) se prueba en Node; el proceso recibe el contexto de audio como dependencia.

export type EstiloVoz = "natural" | "presentador" | "suave";

export const ESTILOS_VOZ: { id: EstiloVoz; nombre: string; descripcion: string }[] = [
  { id: "natural", nombre: "Natural", descripcion: "La voz tal como sale, sin efectos." },
  {
    id: "presentador",
    nombre: "Voz grave de presentador de comerciales",
    descripcion: "Más grave, más lenta y con más cuerpo, como un anuncio de radio.",
  },
  { id: "suave", nombre: "Suave", descripcion: "Más cálida y tranquila, con un poco de ambiente." },
];

// Un valor guardado o pedido que no es un estilo conocido → natural
export const estiloVoz = (id: unknown): EstiloVoz =>
  ESTILOS_VOZ.some((e) => e.id === id) ? (id as EstiloVoz) : "natural";

type Banda = { hz: number; db: number } | null;
export type ParametrosEstilo = {
  velocidad: number; // < 1 baja el tono y hace la voz más lenta
  graves: Banda; // realce de graves (lowshelf)
  presencia: Banda; // realce en medios-agudos para que se entienda (peaking)
  agudos: Banda; // corte de agudos (highshelf)
  pasaBajos: number | null; // quita todo lo que pase de esta frecuencia (lowpass)
  compresor: boolean;
  ambiente: number; // cuánto eco de sala se mezcla (0 = nada)
};

export function parametrosEstilo(id: EstiloVoz): ParametrosEstilo {
  if (id === "presentador")
    return {
      velocidad: 0.92,
      graves: { hz: 200, db: 6 },
      presencia: { hz: 2500, db: 3 },
      agudos: null,
      pasaBajos: null,
      compresor: true,
      ambiente: 0,
    };
  if (id === "suave")
    return {
      velocidad: 0.97,
      graves: null,
      presencia: null,
      agudos: { hz: 4000, db: -6 },
      pasaBajos: 7000,
      compresor: false,
      ambiente: 0.18,
    };
  return { velocidad: 1, graves: null, presencia: null, agudos: null, pasaBajos: null, compresor: false, ambiente: 0 };
}

// ---------- WAV ----------

// Un canal de audio (valores de −1 a 1) como archivo WAV PCM de 16 bits mono. Lo que se pasa de ±1 se recorta.
export function wavDesdeCanal(datos: Float32Array, frecuencia: number): Blob {
  const bytes = datos.length * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const escribir = (desde: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(desde + i, s.charCodeAt(i));
  };
  escribir(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  escribir(8, "WAVE");
  escribir(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, frecuencia, true);
  v.setUint32(28, frecuencia * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  escribir(36, "data");
  v.setUint32(40, bytes, true);
  for (let i = 0; i < datos.length; i++) {
    const s = Number.isNaN(datos[i]) ? 0 : Math.max(-1, Math.min(1, datos[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([v.buffer], { type: "audio/wav" });
}

// El tipo del audio por sus primeros bytes (para devolver el original tal cual)
function tipoDeAudio(audio: ArrayBuffer): string {
  const b = new Uint8Array(audio.slice(0, 4));
  const s = String.fromCharCode(...b);
  if (s === "RIFF") return "audio/wav";
  if (s === "OggS") return "audio/ogg";
  if (s === "fLaC") return "audio/flac";
  return "audio/mpeg"; // MP3 (con «ID3» o sin él): lo que entregan las voces
}

// ---------- Proceso ----------

const FRECUENCIA = 32000; // de sobra para una voz (las voces llegan a 24 kHz) y el WAV pesa poco
const ECO_SEGUNDOS = 1.2;

type CrearContexto = (canales: number, largo: number, frecuencia: number) => OfflineAudioContext;
const contextoDelNavegador: CrearContexto = (c, l, f) => new OfflineAudioContext(c, l, f);

// Aplica un estilo a un audio (MP3 u otro que el navegador sepa leer) y lo devuelve como WAV mono.
// «Natural» devuelve los mismos bytes. Si algo falla (aparato sin Web Audio, audio raro), devuelve el original.
export async function aplicarEstilo(audio: ArrayBuffer, id: EstiloVoz, crearContexto: CrearContexto = contextoDelNavegador): Promise<Blob> {
  const original = () => new Blob([audio], { type: tipoDeAudio(audio) });
  const estilo = estiloVoz(id);
  if (estilo === "natural") return original();
  const p = parametrosEstilo(estilo);
  try {
    // decodeAudioData se queda con los bytes: se le pasa una copia para poder devolver el original
    const leido = await crearContexto(1, 1, FRECUENCIA).decodeAudioData(audio.slice(0));
    const largo = Math.max(1, Math.ceil((leido.duration * FRECUENCIA) / p.velocidad));
    const ctx = crearContexto(1, largo, FRECUENCIA);

    const fuente = ctx.createBufferSource();
    fuente.buffer = leido;
    fuente.playbackRate.value = p.velocidad;
    let ultimo: AudioNode = fuente;
    const filtro = (tipo: BiquadFilterType, hz: number, db = 0) => {
      const f = ctx.createBiquadFilter();
      f.type = tipo;
      f.frequency.value = hz;
      f.gain.value = db;
      ultimo = ultimo.connect(f);
    };
    if (p.graves) filtro("lowshelf", p.graves.hz, p.graves.db);
    if (p.presencia) filtro("peaking", p.presencia.hz, p.presencia.db);
    if (p.agudos) filtro("highshelf", p.agudos.hz, p.agudos.db);
    if (p.pasaBajos) filtro("lowpass", p.pasaBajos);
    if (p.compresor) {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -24;
      c.knee.value = 12;
      c.ratio.value = 4;
      c.attack.value = 0.005;
      c.release.value = 0.2;
      ultimo = ultimo.connect(c);
    }
    ultimo.connect(ctx.destination);
    if (p.ambiente > 0) {
      // Eco de sala: ruido que se apaga poco a poco durante 1.2 s, mezclado bajito
      const n = Math.round(ECO_SEGUNDOS * FRECUENCIA);
      const impulso = ctx.createBuffer(1, n, FRECUENCIA);
      const d = impulso.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const eco = ctx.createConvolver();
      eco.buffer = impulso;
      const mezcla = ctx.createGain();
      mezcla.gain.value = p.ambiente;
      ultimo.connect(eco).connect(mezcla).connect(ctx.destination);
    }
    fuente.start(0);
    const salida = (await ctx.startRendering()).getChannelData(0);
    // Si el realce de graves saturó, se baja todo un poco en vez de recortar
    let pico = 0;
    for (let i = 0; i < salida.length; i++) pico = Math.max(pico, Math.abs(salida[i]));
    if (pico > 0.99) for (let i = 0; i < salida.length; i++) salida[i] *= 0.99 / pico;
    return wavDesdeCanal(salida, FRECUENCIA);
  } catch {
    return original();
  }
}
