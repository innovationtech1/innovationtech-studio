// Música gratis y sin derechos de autor: se compone y se sintetiza dentro del navegador.
// Cada estilo define tempo, tonalidad, progresión de acordes, batería, bajo, armonía y melodía.
// Con la misma «semilla» siempre sale la misma pieza; otra semilla = otra versión del estilo.

export type MusicStyleId = "pop" | "lofi" | "corporativo" | "latino" | "electronica" | "epico" | "acustico";

export const MUSIC_STYLES: { id: MusicStyleId; label: string; emoji: string; desc: string }[] = [
  { id: "pop", label: "Alegre pop", emoji: "😄", desc: "Optimista y pegajosa, ideal para promociones" },
  { id: "lofi", label: "Lo-fi relajado", emoji: "☕", desc: "Tranquila, para cafeterías y momentos cálidos" },
  { id: "corporativo", label: "Corporativo", emoji: "💼", desc: "Positiva y profesional, para servicios y marcas" },
  { id: "latino", label: "Latino", emoji: "🌮", desc: "Ritmo urbano latino, para comida y fiesta" },
  { id: "electronica", label: "Electrónica", emoji: "⚡", desc: "Energía de club, para lanzamientos y moda" },
  { id: "epico", label: "Épico", emoji: "🎬", desc: "Cinemático y dramático, para anuncios impactantes" },
  { id: "acustico", label: "Acústico cálido", emoji: "🎸", desc: "Guitarra suave, natural y cercana" },
];

type Drum = { kick: number[]; snare: number[]; clap: number[]; hat: number[]; openHat: number[]; shaker: number[]; tom: number[] };
type Def = {
  bpm: number;
  root: number; // nota MIDI de la tónica
  minor: boolean;
  progression: number[]; // grados (0 = I)
  sevenths: boolean;
  swing: number;
  drums: Drum;
  bass: { steps: number[]; wave: OscillatorType; cutoff: number; octave: number; fifthOn?: number[] };
  harmony: "pluck" | "rhodes" | "piano" | "marimba" | "stabs" | "strings" | "guitar";
  pad: boolean;
  lead: "none" | "bell" | "flute" | "horn";
  lofi?: boolean;
  sidechain?: boolean;
};

const E: number[] = [];
const S = (...a: number[]) => a;

const STYLES: Record<MusicStyleId, Def> = {
  pop: {
    bpm: 118, root: 60, minor: false, progression: [0, 4, 5, 3], sevenths: false, swing: 0,
    drums: { kick: S(0, 8, 10), snare: S(4, 12), clap: S(4, 12), hat: S(0, 2, 4, 6, 8, 10, 12, 14), openHat: E, shaker: E, tom: E },
    bass: { steps: S(0, 2, 4, 6, 8, 10, 12, 14), wave: "sawtooth", cutoff: 700, octave: -2 },
    harmony: "pluck", pad: true, lead: "bell",
  },
  lofi: {
    bpm: 80, root: 63, minor: false, progression: [1, 4, 0, 5], sevenths: true, swing: 0.22,
    drums: { kick: S(0, 7, 10), snare: S(4, 12), clap: E, hat: S(0, 2, 4, 6, 8, 10, 12, 14), openHat: E, shaker: E, tom: E },
    bass: { steps: S(0, 10), wave: "sine", cutoff: 500, octave: -2, fifthOn: S(6) },
    harmony: "rhodes", pad: false, lead: "flute", lofi: true,
  },
  corporativo: {
    bpm: 108, root: 62, minor: false, progression: [0, 5, 3, 4], sevenths: false, swing: 0,
    drums: { kick: S(0, 8), snare: E, clap: S(4, 12), hat: S(0, 2, 4, 6, 8, 10, 12, 14), openHat: E, shaker: S(1, 3, 5, 7, 9, 11, 13, 15), tom: E },
    bass: { steps: S(0, 2, 4, 6, 8, 10, 12, 14), wave: "triangle", cutoff: 900, octave: -2 },
    harmony: "piano", pad: true, lead: "bell",
  },
  latino: {
    bpm: 96, root: 57, minor: true, progression: [0, 5, 2, 6], sevenths: false, swing: 0,
    drums: { kick: S(0, 4, 8, 12), snare: S(3, 6, 11, 14), clap: E, hat: S(0, 2, 4, 6, 8, 10, 12, 14), openHat: E, shaker: S(2, 6, 10, 14), tom: E },
    bass: { steps: S(0, 3, 6, 8, 11, 14), wave: "sine", cutoff: 600, octave: -2 },
    harmony: "marimba", pad: false, lead: "flute",
  },
  electronica: {
    bpm: 124, root: 53, minor: true, progression: [0, 5, 2, 6], sevenths: false, swing: 0,
    drums: { kick: S(0, 4, 8, 12), snare: E, clap: S(4, 12), hat: S(1, 3, 5, 7, 9, 11, 13, 15), openHat: S(2, 6, 10, 14), shaker: E, tom: E },
    bass: { steps: S(2, 6, 10, 14), wave: "sawtooth", cutoff: 650, octave: -2 },
    harmony: "stabs", pad: true, lead: "none", sidechain: true,
  },
  epico: {
    bpm: 88, root: 62, minor: true, progression: [0, 5, 2, 6], sevenths: false, swing: 0,
    drums: { kick: S(0, 10), snare: S(8), clap: E, hat: E, openHat: E, shaker: E, tom: S(12, 13, 14, 15) },
    bass: { steps: S(0), wave: "sawtooth", cutoff: 300, octave: -2 },
    harmony: "strings", pad: false, lead: "horn",
  },
  acustico: {
    bpm: 100, root: 55, minor: false, progression: [0, 3, 5, 4], sevenths: false, swing: 0.08,
    drums: { kick: S(0, 8), snare: S(4, 12), clap: E, hat: E, openHat: E, shaker: S(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15), tom: E },
    bass: { steps: S(0, 8), wave: "sine", cutoff: 500, octave: -2, fifthOn: S(8) },
    harmony: "guitar", pad: false, lead: "none",
  },
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Notas (MIDI) del acorde sobre un grado de la escala
function chord(def: Def, degree: number, size: number): number[] {
  const sc = def.minor ? MINOR : MAJOR;
  const out: number[] = [];
  for (let k = 0; k < size; k++) {
    const d = degree + k * 2;
    out.push(def.root + sc[d % 7] + 12 * Math.floor(d / 7));
  }
  return out;
}

function scaleNote(def: Def, idx: number) {
  const sc = def.minor ? MINOR : MAJOR;
  const o = Math.floor(idx / 7);
  return def.root + sc[((idx % 7) + 7) % 7] + 12 * o;
}

export async function renderMusic(opts: { style: MusicStyleId; seed: number; duration: number; sampleRate?: number }): Promise<AudioBuffer> {
  const def = STYLES[opts.style];
  const sr = opts.sampleRate || 44100;
  const dur = Math.max(2, opts.duration);
  const rand = rng(opts.seed * 7919 + opts.style.length * 131);

  const step = 60 / def.bpm / 4; // semicorchea
  const bar = step * 16;
  const bars = Math.ceil(dur / bar);

  // ---------- Composición ----------
  // Elementos variables por semilla
  const arpPatterns = [
    [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1],
    [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2],
    [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3],
    [2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1],
  ];
  const arp = arpPatterns[Math.floor(rand() * arpPatterns.length)];
  const progShift = Math.floor(rand() * def.progression.length);
  const prog = def.progression.map((_, i) => def.progression[(i + progShift) % def.progression.length]);
  const melodyRhythms = [
    [0, 3, 6, 8, 10, 12],
    [0, 4, 6, 10, 12],
    [0, 2, 4, 8, 11, 14],
    [0, 6, 8, 12, 14],
  ];
  const mRhythm = melodyRhythms[Math.floor(rand() * melodyRhythms.length)];
  // Motivo melódico de 2 compases (índices de escala), que se repite con variaciones
  let pos = 7 + Math.floor(rand() * 3);
  const motif = Array.from({ length: mRhythm.length * 2 }, () => {
    pos += Math.floor(rand() * 5) - 2;
    pos = Math.max(5, Math.min(12, pos));
    return pos;
  });

  const swingAt = (t: number, s: number) => (s % 2 === 1 ? t + def.swing * step : t);


  // Se compone por secciones de 4 compases (cada una en su propio renderizado):
  // así el tiempo crece en proporción a la duración y no se dispara en videos largos.
  const SEG = 4;
  const TAIL = 2.6; // segundos extra para que las notas terminen de sonar
  const total = Math.ceil(sr * dur);
  const L = new Float32Array(total);
  const R = new Float32Array(total);

  const renderSegment = async (fromBar: number, toBar: number) => {
    const off = fromBar * bar;
    const segLen = Math.min(dur - off, (toBar - fromBar) * bar) + TAIL;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * segLen), sr);
    const sum = ctx.createGain();
    sum.gain.value = 0.8;
    if (def.lofi) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 4200;
      sum.connect(lp).connect(ctx.destination);
    } else sum.connect(ctx.destination);
    const comp = sum;

    const bus = (gain: number, pan = 0) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        p.connect(comp);
      } else g.connect(comp);
      return g;
    };
    const drumBus = bus(0.9);
    const bassBus = bus(0.55);
    const harmBus = bus(0.32, -0.15);
    const padBus = bus(0.16, 0.15);
    const leadBus = bus(0.2, 0.1);
    if (def.sidechain) {
      // La armonía «respira» con el bombo (un LFO en vez de miles de automatizaciones)
      padBus.gain.value = 0.1;
      const lfo = ctx.createOscillator();
      lfo.type = "sawtooth";
      lfo.frequency.value = def.bpm / 60;
      const depth = ctx.createGain();
      depth.gain.value = 0.06;
      lfo.connect(depth).connect(padBus.gain);
      lfo.start(0);
    }

    // Ruido blanco (para batería)
    const noise = ctx.createBuffer(1, sr, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noiseSrc = (t: number, len: number) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.start(t, Math.random() * 0.5, len + 0.05);
      return s;
    };

    // ---------- Instrumentos ----------
    const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    };
    const kick = (t: number, v = 1) => {
      t -= off; // tiempo local de la sección
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      env(g, t, v, 0.003, 0.35);
      o.connect(g).connect(drumBus);
      o.start(t);
      o.stop(t + 0.45);
    };
    const snare = (t: number, v = 0.6) => {
      t -= off; // tiempo local de la sección
      const n = noiseSrc(t, 0.22);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1900;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      env(g, t, v, 0.002, 0.18);
      n.connect(f).connect(g).connect(drumBus);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 190;
      const og = ctx.createGain();
      env(og, t, v * 0.5, 0.002, 0.08);
      o.connect(og).connect(drumBus);
      o.start(t);
      o.stop(t + 0.15);
    };
    const clap = (t: number, v = 0.45) => {
      t -= off; // tiempo local de la sección
      for (let k = 0; k < 3; k++) {
        const n = noiseSrc(t + k * 0.011, 0.12);
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1500;
        const g = ctx.createGain();
        env(g, t + k * 0.011, v, 0.001, k === 2 ? 0.14 : 0.02);
        n.connect(f).connect(g).connect(drumBus);
      }
    };
    const hat = (t: number, open: boolean, v = 0.18) => {
      t -= off; // tiempo local de la sección
      const n = noiseSrc(t, open ? 0.3 : 0.06);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7500;
      const g = ctx.createGain();
      env(g, t, v, 0.001, open ? 0.25 : 0.04);
      n.connect(f).connect(g).connect(drumBus);
    };
    const shaker = (t: number, v = 0.1) => {
      t -= off; // tiempo local de la sección
      const n = noiseSrc(t, 0.08);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 6000;
      f.Q.value = 1.5;
      const g = ctx.createGain();
      env(g, t, v, 0.01, 0.05);
      n.connect(f).connect(g).connect(drumBus);
    };
    const tom = (t: number, f0: number, v = 0.7) => {
      t -= off; // tiempo local de la sección
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.3);
      env(g, t, v, 0.003, 0.45);
      o.connect(g).connect(drumBus);
      o.start(t);
      o.stop(t + 0.55);
    };

    const bassNote = (t: number, m: number, len: number) => {
      t -= off; // tiempo local de la sección
      const o = ctx.createOscillator();
      o.type = def.bass.wave;
      o.frequency.value = hz(m);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = def.bass.cutoff;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
      g.gain.setValueAtTime(0.9, t + Math.max(0.02, len * 0.7));
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(f).connect(g).connect(bassBus);
      o.start(t);
      o.stop(t + len + 0.05);
    };

    // Tonos sintetizados para la armonía
    const tone = (t: number, m: number, len: number, kind: Def["harmony"] | "bell" | "flute" | "horn", v = 0.5, dest: AudioNode = harmBus) => {
      t -= off; // tiempo local de la sección
      const f0 = hz(m);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      const parts: [OscillatorType, number, number][] = []; // tipo, multiplicador, nivel
      let attack = 0.005;
      let decay = len;
      let sustain = false;
      switch (kind) {
        case "pluck":
          parts.push(["triangle", 1, 1], ["square", 1, 0.15]);
          lp.frequency.setValueAtTime(5000, t);
          lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
          decay = 0.35;
          break;
        case "rhodes":
          parts.push(["sine", 1, 1], ["sine", 2, 0.25], ["sine", 3, 0.06]);
          lp.frequency.value = 3000;
          decay = Math.max(0.8, len);
          break;
        case "piano":
          parts.push(["triangle", 1, 1], ["sine", 2, 0.35], ["sine", 3, 0.12]);
          lp.frequency.setValueAtTime(4500, t);
          lp.frequency.exponentialRampToValueAtTime(1500, t + 0.6);
          decay = 1.1;
          break;
        case "marimba":
          parts.push(["sine", 1, 1], ["sine", 4, 0.3]);
          lp.frequency.value = 5000;
          decay = 0.35;
          break;
        case "stabs":
          parts.push(["sawtooth", 1, 0.6], ["sawtooth", 1.006, 0.6]);
          lp.frequency.setValueAtTime(2800, t);
          lp.frequency.exponentialRampToValueAtTime(600, t + 0.2);
          decay = 0.22;
          break;
        case "strings":
          parts.push(["sawtooth", 1, 0.5], ["sawtooth", 1.004, 0.5], ["sawtooth", 0.996, 0.5]);
          lp.frequency.value = 1400;
          attack = Math.min(0.6, len * 0.4);
          sustain = true;
          break;
        case "bell":
          parts.push(["sine", 1, 1], ["sine", 2.01, 0.4], ["sine", 3.98, 0.12]);
          lp.frequency.value = 6000;
          decay = 0.9;
          break;
        case "flute":
          parts.push(["sine", 1, 1], ["triangle", 2, 0.08]);
          lp.frequency.value = 3500;
          attack = 0.04;
          sustain = true;
          break;
        case "horn":
          parts.push(["sawtooth", 1, 0.6], ["sawtooth", 0.5, 0.3]);
          lp.frequency.setValueAtTime(600, t);
          lp.frequency.linearRampToValueAtTime(1600, t + 0.3);
          attack = 0.12;
          sustain = true;
          break;
        default:
          parts.push(["sine", 1, 1]);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + attack);
      if (sustain) {
        g.gain.setValueAtTime(v, t + Math.max(attack, len - 0.15));
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
      } else g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      lp.connect(g).connect(dest);
      const end = t + (sustain ? len + 0.3 : attack + decay + 0.05);
      for (const [type, mul, lvl] of parts) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f0 * mul;
        if (kind === "flute" || kind === "horn") {
          // vibrato suave
          const lfo = ctx.createOscillator();
          const lg = ctx.createGain();
          lfo.frequency.value = 5;
          lg.gain.value = f0 * 0.006;
          lfo.connect(lg).connect(o.frequency);
          lfo.start(t);
          lfo.stop(end);
        }
        const og = ctx.createGain();
        og.gain.value = lvl;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(end);
      }
    };

    // Guitarra (Karplus-Strong): cuerdas punteadas realistas
    const guitarCache = new Map<number, AudioBuffer>();
    const guitar = (t: number, m: number, v = 0.5) => {
      t -= off; // tiempo local de la sección
      const f = Math.round(hz(m));
      let buf = guitarCache.get(f);
      if (!buf) {
        const len = Math.floor(sr * 1.6);
        buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        const N = Math.max(2, Math.round(sr / f));
        const ring = new Float32Array(N);
        for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
        let idx = 0;
        for (let i = 0; i < len; i++) {
          const nxt = (idx + 1) % N;
          const val = 0.4985 * (ring[idx] + ring[nxt]);
          d[i] = ring[idx];
          ring[idx] = val;
          idx = nxt;
        }
        guitarCache.set(f, buf);
      }
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = v;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      s.connect(lp).connect(g).connect(harmBus);
      s.start(t);
    };

    const pad = (t: number, notes: number[], len: number) => {
      notes.forEach((m) => tone(t, m, len, "strings", 0.35, padBus));
    };


    for (let b = fromBar; b < toBar; b++) {
      const t0 = b * bar;
      if (t0 >= dur) break;
      const intro = b === 0 && dur > bar * 3;
      const last = (b + 1) * bar >= dur;
      const degree = prog[b % prog.length];
      const ch = chord(def, degree, def.sevenths ? 4 : 3);
      const fill = b % 4 === 3;

      // Batería
      const d = def.drums;
      for (let s = 0; s < 16; s++) {
        const t = swingAt(t0 + s * step, s);
        if (t >= dur) break;
        if (intro && s % 4 !== 0) continue;
        if (d.kick.includes(s) && !(intro && s > 0)) kick(t, def.lofi ? 0.7 : 0.95);
        if (intro) continue;
        if (d.snare.includes(s)) snare(t, def.lofi ? 0.35 : 0.55);
        if (d.clap.includes(s)) clap(t);
        if (d.hat.includes(s)) hat(t, false, def.lofi ? 0.1 : s % 4 === 0 ? 0.16 : 0.11);
        if (d.openHat.includes(s)) hat(t, true, 0.12);
        if (d.shaker.includes(s)) shaker(t, s % 2 ? 0.07 : 0.11);
        if (d.tom.includes(s) && fill) tom(t, 140 - (s - 12) * 18);
        if (fill && !def.drums.tom.length && s >= 13 && def.drums.snare.length) snare(t, 0.3);
      }
      if (def.drums.tom.length && b % 2 === 1 && !intro) tom(t0 + 8 * step, 90, 0.8);

      // Bajo
      if (!intro) {
        const rootM = ch[0] + 12 * def.bass.octave;
        for (const s of def.bass.steps) {
          const t = swingAt(t0 + s * step, s);
          if (t >= dur) break;
          const next = def.bass.steps.find((x) => x > s) ?? 16;
          const len = def.harmony === "strings" ? bar : Math.min((next - s) * step * 0.9, step * 4);
          bassNote(t, rootM, len);
        }
        for (const s of def.bass.fifthOn || []) bassNote(swingAt(t0 + s * step, s), ch[0] + 7 + 12 * def.bass.octave, step * 3);
      }

      // Colchón (pad)
      if (def.pad) pad(t0, ch, bar);

      // Armonía según el estilo
      switch (def.harmony) {
        case "pluck":
        case "piano":
          if (!intro)
            for (let s = 0; s < 16; s += def.harmony === "piano" ? 2 : 1) {
              const t = t0 + s * step;
              if (t >= dur) break;
              const idx = arp[s] % ch.length;
              tone(t, ch[idx] + 12, step * 2, def.harmony, def.harmony === "piano" ? 0.45 : 0.35);
            }
          break;
        case "rhodes":
          [0, 7, 10].forEach((s, k) => {
            const t = swingAt(t0 + s * step, s);
            if (t < dur) ch.forEach((m) => tone(t, m, step * (k === 0 ? 6 : 3), "rhodes", 0.22));
          });
          break;
        case "marimba":
          if (!intro)
            [0, 3, 6, 8, 11, 14].forEach((s, k) => {
              const t = t0 + s * step;
              if (t < dur) tone(t, ch[k % ch.length] + 12, step, "marimba", 0.5);
            });
          break;
        case "stabs":
          if (!intro)
            [2, 6, 10, 14].forEach((s) => {
              const t = t0 + s * step;
              if (t < dur) ch.forEach((m) => tone(t, m, step, "stabs", 0.18));
            });
          break;
        case "strings":
          ch.forEach((m) => tone(t0, m, bar, "strings", 0.3));
          if (!intro)
            for (let s = 0; s < 16; s += 2) {
              const t = t0 + s * step;
              if (t < dur) tone(t, [ch[0], ch[2], ch[0] + 12, ch[2]][(s / 2) % 4] + 12, step * 2, "piano", 0.3);
            }
          break;
        case "guitar": {
          // Rasgueo: abajo, abajo, arriba, arriba, abajo, arriba
          const pattern = [0, 4, 6, 10, 12, 14];
          pattern.forEach((s, k) => {
            const t = swingAt(t0 + s * step, s);
            if (t >= dur) return;
            const notes = [ch[0] - 12, ch[0], ch[1], ch[2], ch[0] + 12];
            const up = k % 2 === 1;
            (up ? [...notes].reverse() : notes).forEach((m, i) => guitar(t + i * 0.012, m, up ? 0.22 : 0.3));
          });
          break;
        }
      }

      // Melodía (a partir del segundo compás, no en el último)
      if (def.lead !== "none" && !intro && !last && b >= 1) {
        const half = b % 2;
        mRhythm.forEach((s, k) => {
          const t = t0 + s * step;
          if (t >= dur) return;
          if (b % 8 >= 6 && hash01(opts.seed * 977 + b * 31 + k) < 0.4) return; // respiro
          let idx = motif[half * mRhythm.length + k];
          if (b % 4 === 3 && k === mRhythm.length - 1) idx = 7; // resuelve a la tónica
          const next = mRhythm[k + 1] ?? 16;
          const len = (next - s) * step * (def.lead === "bell" ? 0.6 : 0.95);
          const lead = def.lead as "bell" | "flute" | "horn";
          tone(t, scaleNote(def, idx), len, lead, lead === "horn" ? 0.28 : 0.3, leadBus);
        });
      }
    }


    const b = await ctx.startRendering();
    const start = Math.round(off * sr);
    const l = b.getChannelData(0);
    const r = b.getChannelData(1);
    for (let i = 0; i < l.length && start + i < total; i++) {
      L[start + i] += l[i];
      R[start + i] += r[i];
    }
  };

  for (let s0 = 0; s0 < bars; s0 += SEG) await renderSegment(s0, Math.min(bars, s0 + SEG));

  // Textura lo-fi: crujido de vinilo
  if (def.lofi)
    for (let i = 0; i < total; i++) {
      const c = (Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.25 : 0) + (Math.random() * 2 - 1) * 0.002;
      L[i] += c;
      R[i] += c;
    }

  // Masterización: limitador suave, entrada y salida con desvanecimiento
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const pre = peak > 0 ? 1 / peak : 1;
  const drive = 1.8;
  const norm = Math.tanh(drive);
  const fadeIn = Math.min(0.6, dur * 0.1) * sr;
  const fadeOut = Math.min(2, dur * 0.2) * sr;
  for (let i = 0; i < total; i++) {
    const f = Math.min(1, i / fadeIn, (total - i) / fadeOut);
    L[i] = (Math.tanh(L[i] * pre * drive) / norm) * f;
    R[i] = (Math.tanh(R[i] * pre * drive) / norm) * f;
  }
  const out = new AudioBuffer({ length: total, sampleRate: sr, numberOfChannels: 2 });
  out.copyToChannel(L, 0);
  out.copyToChannel(R, 1);
  normalize(out, 0.89);
  return out;
}

function hash01(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function normalize(buf: AudioBuffer, target: number) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak < 1e-4) return;
  const k = target / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

// Convierte a WAV (para escucharla o descargarla)
export function bufferToWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length * ch * 2 + 44;
  const view = new DataView(new ArrayBuffer(len));
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  view.setUint32(4, len - 8, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, len - 44, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < buf.length; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([view], { type: "audio/wav" });
}
