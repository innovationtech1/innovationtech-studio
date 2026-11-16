import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTILOS_VOZ, aplicarEstilo, estiloVoz, parametrosEstilo, wavDesdeCanal } from "./estilos-voz";

// ---------- Lista y parámetros ----------

test("ESTILOS_VOZ: solo Natural, presentador de comerciales y Suave, con esos nombres exactos", () => {
  assert.deepEqual(
    ESTILOS_VOZ.map((e) => [e.id, e.nombre]),
    [
      ["natural", "Natural"],
      ["presentador", "Voz grave de presentador de comerciales"],
      ["suave", "Suave"],
    ],
  );
  for (const e of ESTILOS_VOZ) assert.ok(e.descripcion.length > 5);
});

test("parametrosEstilo: natural no cambia nada", () => {
  assert.deepEqual(parametrosEstilo("natural"), {
    velocidad: 1,
    graves: null,
    presencia: null,
    agudos: null,
    pasaBajos: null,
    compresor: false,
    ambiente: 0,
  });
});

test("parametrosEstilo: presentador baja el tono, más graves y presencia, con compresor", () => {
  assert.deepEqual(parametrosEstilo("presentador"), {
    velocidad: 0.92,
    graves: { hz: 200, db: 6 },
    presencia: { hz: 2500, db: 3 },
    agudos: null,
    pasaBajos: null,
    compresor: true,
    ambiente: 0,
  });
});

test("parametrosEstilo: suave quita agudos y agrega un poco de ambiente", () => {
  assert.deepEqual(parametrosEstilo("suave"), {
    velocidad: 0.97,
    graves: null,
    presencia: null,
    agudos: { hz: 4000, db: -6 },
    pasaBajos: 7000,
    compresor: false,
    ambiente: 0.18,
  });
});

test("estiloVoz: un valor desconocido (o de otro tipo) → natural", () => {
  assert.equal(estiloVoz("presentador"), "presentador");
  assert.equal(estiloVoz("suave"), "suave");
  assert.equal(estiloVoz("robot"), "natural");
  assert.equal(estiloVoz(undefined), "natural");
  assert.equal(estiloVoz(3), "natural");
});

// ---------- WAV ----------

const texto = (v: DataView, desde: number, largo: number) =>
  String.fromCharCode(...Array.from({ length: largo }, (_, i) => v.getUint8(desde + i)));

test("wavDesdeCanal: encabezado RIFF de PCM 16 bits mono y tamaños correctos", async () => {
  const datos = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const b = wavDesdeCanal(datos, 24000);
  assert.equal(b.type, "audio/wav");
  const v = new DataView(await b.arrayBuffer());
  assert.equal(v.byteLength, 44 + datos.length * 2);
  assert.equal(texto(v, 0, 4), "RIFF");
  assert.equal(v.getUint32(4, true), 36 + datos.length * 2);
  assert.equal(texto(v, 8, 4), "WAVE");
  assert.equal(texto(v, 12, 4), "fmt ");
  assert.equal(v.getUint32(16, true), 16); // tamaño del bloque fmt
  assert.equal(v.getUint16(20, true), 1); // PCM
  assert.equal(v.getUint16(22, true), 1); // mono
  assert.equal(v.getUint32(24, true), 24000); // frecuencia
  assert.equal(v.getUint32(28, true), 48000); // bytes por segundo
  assert.equal(v.getUint16(32, true), 2); // bytes por muestra
  assert.equal(v.getUint16(34, true), 16); // bits
  assert.equal(texto(v, 36, 4), "data");
  assert.equal(v.getUint32(40, true), datos.length * 2);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true)),
    [0, 16383, -16384, 32767, -32768],
  );
});

test("wavDesdeCanal: recorta lo que se pasa de ±1 (y NaN → silencio)", async () => {
  const v = new DataView(await wavDesdeCanal(new Float32Array([3, -7, NaN]), 8000).arrayBuffer());
  assert.equal(v.getInt16(44, true), 32767);
  assert.equal(v.getInt16(46, true), -32768);
  assert.equal(v.getInt16(48, true), 0);
});

// ---------- aplicarEstilo ----------

const mp3 = () => new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]).buffer; // empieza con «ID3»

test("aplicarEstilo natural: devuelve los mismos bytes, sin procesar", async () => {
  let creados = 0;
  const original = mp3();
  const b = await aplicarEstilo(original, "natural", () => {
    creados++;
    throw new Error("no se debe usar");
  });
  assert.equal(creados, 0);
  assert.equal(b.type, "audio/mpeg");
  assert.deepEqual(new Uint8Array(await b.arrayBuffer()), new Uint8Array(original));
});

test("aplicarEstilo: si el proceso falla devuelve el original (nunca lanza)", async () => {
  const b = await aplicarEstilo(mp3(), "presentador", () => {
    throw new Error("sin audio en este aparato");
  });
  assert.equal(b.type, "audio/mpeg");
  assert.deepEqual(new Uint8Array(await b.arrayBuffer()), new Uint8Array(mp3()));
});

// Un OfflineAudioContext falso: registra lo que se arma y devuelve una señal fija
function contextoFalso() {
  const registro = { contextos: [] as { canales: number; largo: number; frecuencia: number }[], nodos: [] as Record<string, unknown>[] };
  const param = () => ({ value: 0 });
  const crear = (canales: number, largo: number, frecuencia: number) => {
    registro.contextos.push({ canales, largo, frecuencia });
    const nodo = (tipo: string, extra: Record<string, unknown> = {}) => {
      const n: Record<string, unknown> = { tipo, conexiones: [] as unknown[], ...extra };
      n.connect = (d: unknown) => ((n.conexiones as unknown[]).push(d), d);
      registro.nodos.push(n);
      return n;
    };
    return {
      sampleRate: frecuencia,
      destination: { tipo: "salida" },
      decodeAudioData: async () => ({ duration: 2, sampleRate: frecuencia, length: 2 * frecuencia, numberOfChannels: 1 }),
      createBufferSource: () => nodo("fuente", { playbackRate: param(), buffer: null, start: () => {} }),
      createBiquadFilter: () => nodo("filtro", { type: "", frequency: param(), gain: param(), Q: param() }),
      createDynamicsCompressor: () =>
        nodo("compresor", { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
      createConvolver: () => nodo("eco", { buffer: null }),
      createGain: () => nodo("volumen", { gain: param() }),
      createBuffer: (c: number, l: number) => ({ numberOfChannels: c, length: l, getChannelData: () => new Float32Array(l) }),
      startRendering: async () => ({ getChannelData: () => new Float32Array(largo).fill(0.25), sampleRate: frecuencia, length: largo }),
    } as unknown as OfflineAudioContext;
  };
  return { crear, registro };
}

test("aplicarEstilo presentador: alarga a duración / velocidad, filtros y compresor, y sale en WAV", async () => {
  const { crear, registro } = contextoFalso();
  const b = await aplicarEstilo(mp3(), "presentador", crear);
  assert.equal(b.type, "audio/wav");
  const render = registro.contextos.at(-1)!;
  assert.equal(render.canales, 1);
  assert.equal(render.largo, Math.ceil((2 * render.frecuencia) / 0.92));
  assert.equal(b.size, 44 + render.largo * 2);
  const fuente = registro.nodos.find((n) => n.tipo === "fuente") as { playbackRate: { value: number } };
  assert.equal(fuente.playbackRate.value, 0.92);
  const filtros = registro.nodos.filter((n) => n.tipo === "filtro") as { type: string; frequency: { value: number }; gain: { value: number } }[];
  assert.deepEqual(
    filtros.map((f) => [f.type, f.frequency.value, f.gain.value]),
    [
      ["lowshelf", 200, 6],
      ["peaking", 2500, 3],
    ],
  );
  assert.ok(registro.nodos.some((n) => n.tipo === "compresor"));
  assert.ok(!registro.nodos.some((n) => n.tipo === "eco"));
});

test("aplicarEstilo suave: quita agudos, pasa bajos y mezcla el ambiente", async () => {
  const { crear, registro } = contextoFalso();
  const b = await aplicarEstilo(mp3(), "suave", crear);
  assert.equal(b.type, "audio/wav");
  const filtros = registro.nodos.filter((n) => n.tipo === "filtro") as { type: string; frequency: { value: number }; gain: { value: number } }[];
  assert.deepEqual(
    filtros.map((f) => [f.type, f.frequency.value]),
    [
      ["highshelf", 4000],
      ["lowpass", 7000],
    ],
  );
  assert.equal(filtros[0].gain.value, -6);
  assert.ok(!registro.nodos.some((n) => n.tipo === "compresor"));
  const eco = registro.nodos.find((n) => n.tipo === "eco") as { buffer: { length: number } };
  const render = registro.contextos.at(-1)!;
  assert.equal(eco.buffer.length, Math.round(1.2 * render.frecuencia));
  const volumenes = registro.nodos.filter((n) => n.tipo === "volumen") as { gain: { value: number } }[];
  assert.ok(volumenes.some((g) => g.gain.value === 0.18));
});
