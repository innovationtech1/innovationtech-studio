// Música gratis y sin derechos de autor: se compone y se sintetiza dentro del navegador.
// Cada estilo define rangos de tempo, tonalidades, progresiones, ritmos de batería, bajo,
// instrumentos y melodía. Cada «versión» (semilla) elige una combinación distinta y arma
// la canción por secciones (intro, verso, coro, puente y final), así que no hay dos iguales.
// Con la misma semilla siempre sale la misma pieza.

import { getLang, tr } from "./i18n";

export type MusicStyleId =
  | "pop"
  | "lofi"
  | "corporativo"
  | "latino"
  | "electronica"
  | "epico"
  | "acustico"
  | "reggaeton"
  | "cumbia"
  | "norteno"
  | "hiphop"
  | "house"
  | "funk"
  | "bossa"
  | "inspirador"
  | "romantico"
  | "festivo"
  | "suspenso"
  | "infantil"
  | "rock";

export type MusicGroup = "animada" | "latina" | "tranquila" | "intensa";

export const MUSIC_GROUPS: { id: MusicGroup; label: string }[] = [
  { id: "animada", label: "Alegre" },
  { id: "latina", label: "Latina" },
  { id: "tranquila", label: "Tranquila" },
  { id: "intensa", label: "Intensa" },
];

export const MUSIC_STYLES: { id: MusicStyleId; label: string; emoji: string; desc: string; group: MusicGroup }[] = [
  { id: "pop", label: "Alegre pop", emoji: "😄", desc: "Optimista y pegajosa, ideal para promociones", group: "animada" },
  { id: "house", label: "House", emoji: "🪩", desc: "Bailable y elegante, para moda, bares y eventos", group: "animada" },
  { id: "funk", label: "Funk disco", emoji: "🕺", desc: "Groove con metales, divertida y con estilo", group: "animada" },
  { id: "infantil", label: "Divertida", emoji: "🎈", desc: "Ukulele y xilófono, para niños y ofertas simpáticas", group: "animada" },
  { id: "festivo", label: "Fiestas", emoji: "🎄", desc: "Campanitas y alegría para Navidad y temporadas", group: "animada" },
  { id: "corporativo", label: "Corporativo", emoji: "💼", desc: "Positiva y profesional, para servicios y marcas", group: "animada" },
  { id: "latino", label: "Latino pop", emoji: "🌮", desc: "Marimba y percusión, para comida y fiesta", group: "latina" },
  { id: "reggaeton", label: "Reguetón", emoji: "🔥", desc: "Ritmo dembow urbano, para promos y jóvenes", group: "latina" },
  { id: "cumbia", label: "Cumbia", emoji: "🪗", desc: "Acordeón y güiro, alegre y de barrio", group: "latina" },
  { id: "norteno", label: "Norteño", emoji: "🤠", desc: "Acordeón y bajo sexto con ritmo de polka", group: "latina" },
  { id: "bossa", label: "Bossa nova", emoji: "🍹", desc: "Guitarra suave y jazz ligero, para restaurantes", group: "tranquila" },
  { id: "lofi", label: "Lo-fi relajado", emoji: "☕", desc: "Tranquila, para cafeterías y momentos cálidos", group: "tranquila" },
  { id: "acustico", label: "Acústico cálido", emoji: "🎸", desc: "Guitarra suave, natural y cercana", group: "tranquila" },
  { id: "inspirador", label: "Inspiradora", emoji: "🌅", desc: "Piano y cuerdas que crecen, para historias de marca", group: "tranquila" },
  { id: "romantico", label: "Romántica", emoji: "💕", desc: "Balada de piano, para bodas, flores y regalos", group: "tranquila" },
  { id: "electronica", label: "Electrónica", emoji: "⚡", desc: "Energía de club, para lanzamientos y moda", group: "intensa" },
  { id: "hiphop", label: "Hip-hop / trap", emoji: "🎧", desc: "Bajo 808 y ritmo urbano, para ropa y barberías", group: "intensa" },
  { id: "rock", label: "Rock", emoji: "🤘", desc: "Guitarras con fuerza, para deportes y talleres", group: "intensa" },
  { id: "epico", label: "Épico", emoji: "🎬", desc: "Cinemático y dramático, para anuncios impactantes", group: "intensa" },
  { id: "suspenso", label: "Suspenso", emoji: "🕵️", desc: "Misteriosa, para adelantos y «muy pronto»", group: "intensa" },
];

// ---------------- Definición de los estilos ----------------

type Kit = "electro" | "acoustic" | "808" | "brush" | "none";
type DrumPat = Partial<
  Record<
    "kick" | "snare" | "clap" | "rim" | "hat" | "openHat" | "ride" | "shaker" | "conga" | "bongo" | "cowbell" | "clave" | "guiro" | "sleigh" | "tom" | "hatRoll",
    number[]
  >
>;
type BassKind = "synth" | "sine" | "sub" | "808" | "upright" | "pick";
type Inst =
  | "pluck"
  | "rhodes"
  | "piano"
  | "marimba"
  | "stabs"
  | "guitar"
  | "nylon"
  | "ukulele"
  | "organ"
  | "accordion"
  | "supersaw"
  | "brass"
  | "power"
  | "vibes"
  | "bell";
type Comp = "arp16" | "arp8" | "block" | "offbeat" | "push" | "strum" | "oompah" | "sustain" | "pulse" | "bossa" | "stab4";
type Pad = "strings" | "choir" | "warm";
type Lead = "bell" | "flute" | "horn" | "synth" | "whistle" | "accordion" | "trumpet" | "xylo" | "vibes" | "piano" | "glock" | "nylon";

type Def = {
  bpm: [number, number];
  keys: number[]; // tónicas posibles (MIDI)
  minor: boolean;
  progs: number[][]; // progresiones posibles (grados, 0 = I)
  sevenths?: boolean;
  swing?: number;
  kit: Kit;
  drums: DrumPat[]; // variantes de ritmo
  bass: { kind: BassKind; pats: number[][]; alt?: boolean; octaves?: boolean; cutoff?: number };
  harm: { inst: Inst[]; comp: Comp[]; octave?: number };
  pad: (Pad | null)[];
  lead: (Lead | null)[];
  leadRhythms?: number[][];
  fx?: { lofi?: boolean; sidechain?: boolean; reverb?: number; riser?: boolean; vinyl?: boolean };
  intro?: "soft" | "none";
};

const E8 = [0, 2, 4, 6, 8, 10, 12, 14];
const E16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const OFF8 = [2, 6, 10, 14];
const FOUR = [0, 4, 8, 12];

const STYLES: Record<MusicStyleId, Def> = {
  pop: {
    bpm: [112, 124], keys: [60, 62, 64, 65, 67], minor: false,
    progs: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 0, 4, 5]],
    kit: "electro",
    drums: [
      { kick: [0, 8, 10], clap: [4, 12], hat: E8, openHat: [14] },
      { kick: [0, 6, 8], snare: [4, 12], hat: E16, shaker: OFF8 },
      { kick: FOUR, clap: [4, 12], hat: OFF8, openHat: [14] },
    ],
    bass: { kind: "synth", pats: [E8, [0, 3, 6, 8, 11, 14], [0, 6, 8, 14]], cutoff: 750 },
    harm: { inst: ["pluck", "piano", "supersaw"], comp: ["arp16", "push", "arp8"] },
    pad: ["warm", "strings", null], lead: ["bell", "synth", "whistle", "glock"],
    fx: { reverb: 0.22, riser: true },
  },
  house: {
    bpm: [120, 126], keys: [57, 58, 60, 62, 65], minor: true, sevenths: true,
    progs: [[0, 5, 3, 4], [0, 3, 6, 5], [1, 4, 0, 5]],
    kit: "electro",
    drums: [
      { kick: FOUR, clap: [4, 12], hat: OFF8, openHat: OFF8, shaker: [1, 3, 5, 7, 9, 11, 13, 15] },
      { kick: FOUR, clap: [4, 12], hat: E16, openHat: OFF8 },
    ],
    bass: { kind: "synth", pats: [OFF8, [2, 6, 7, 10, 14], [0, 3, 6, 10, 14]], cutoff: 600 },
    harm: { inst: ["organ", "piano", "stabs"], comp: ["push", "stab4", "offbeat"] },
    pad: ["warm", null], lead: [null, "synth", "vibes"],
    fx: { reverb: 0.25, sidechain: true, riser: true },
  },
  funk: {
    bpm: [104, 116], keys: [60, 62, 64, 65], minor: false, sevenths: true,
    progs: [[0, 3, 0, 4], [1, 4, 0, 0], [0, 5, 1, 4]],
    kit: "acoustic",
    drums: [
      { kick: [0, 3, 8, 10], snare: [4, 12], hat: E16, openHat: [6, 14] },
      { kick: FOUR, snare: [4, 12], hat: E8, openHat: OFF8, cowbell: [0, 6, 12] },
    ],
    bass: { kind: "synth", pats: [E8, [0, 3, 6, 7, 10, 12, 14]], octaves: true, cutoff: 1100 },
    harm: { inst: ["stabs", "rhodes", "guitar"], comp: ["offbeat", "push", "strum"] },
    pad: ["strings", null], lead: ["trumpet", "horn", "synth"],
    fx: { reverb: 0.18 },
  },
  infantil: {
    bpm: [118, 132], keys: [60, 62, 65, 67], minor: false,
    progs: [[0, 3, 4, 0], [0, 4, 5, 3], [0, 3, 0, 4]],
    kit: "acoustic",
    drums: [
      { kick: [0, 8], clap: [4, 12], shaker: E8 },
      { kick: [0, 8], snare: [4, 12], hat: E8, clap: [12] },
    ],
    bass: { kind: "upright", pats: [[0, 8], [0, 4, 8, 12]], alt: true },
    harm: { inst: ["ukulele", "marimba"], comp: ["strum", "offbeat"] },
    pad: [null], lead: ["xylo", "whistle", "glock"],
    fx: { reverb: 0.16 },
  },
  festivo: {
    bpm: [112, 124], keys: [60, 62, 65, 67], minor: false,
    progs: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 1, 4]],
    kit: "acoustic",
    drums: [
      { kick: [0, 8], snare: [4, 12], sleigh: E8 },
      { kick: [0, 8], snare: [4, 12], sleigh: E16, hat: [] },
    ],
    bass: { kind: "upright", pats: [[0, 8], [0, 4, 8, 12]], alt: true },
    harm: { inst: ["piano", "pluck"], comp: ["arp8", "push"] },
    pad: ["strings", "warm"], lead: ["glock", "bell", "flute"],
    fx: { reverb: 0.3 },
  },
  corporativo: {
    bpm: [100, 116], keys: [60, 62, 64, 65, 67], minor: false,
    progs: [[0, 5, 3, 4], [0, 4, 5, 3], [3, 4, 0, 5], [5, 3, 0, 4]],
    kit: "electro",
    drums: [
      { kick: [0, 8], clap: [4, 12], hat: E8, shaker: [1, 3, 5, 7, 9, 11, 13, 15] },
      { kick: [0, 7, 8], clap: [4, 12], hat: E16 },
    ],
    bass: { kind: "sine", pats: [E8, [0, 8], [0, 6, 8, 14]] },
    harm: { inst: ["piano", "pluck", "nylon"], comp: ["arp8", "arp16", "pulse"] },
    pad: ["warm", "strings"], lead: ["bell", null, "piano"],
    fx: { reverb: 0.25, riser: true },
  },
  latino: {
    bpm: [94, 104], keys: [57, 59, 60, 62], minor: true,
    progs: [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4]],
    kit: "acoustic",
    drums: [
      { kick: FOUR, snare: [3, 6, 11, 14], hat: E8, conga: [2, 6, 7, 10, 14, 15], shaker: OFF8 },
      { kick: FOUR, rim: [3, 6, 11, 14], bongo: [1, 5, 9, 13], conga: [2, 10], cowbell: [0, 4, 8, 12] },
    ],
    bass: { kind: "sine", pats: [[0, 3, 6, 8, 11, 14], [0, 6, 8, 14]] },
    harm: { inst: ["marimba", "guitar", "piano"], comp: ["bossa", "strum", "offbeat"] },
    pad: [null, "warm"], lead: ["flute", "trumpet", "xylo"],
    fx: { reverb: 0.2 },
  },
  reggaeton: {
    bpm: [88, 96], keys: [56, 57, 59, 61, 62], minor: true,
    progs: [[0, 5, 2, 6], [0, 6, 5, 6], [5, 6, 0, 0], [0, 3, 5, 4]],
    kit: "808",
    drums: [
      { kick: FOUR, snare: [3, 6, 11, 14], hat: E8 },
      { kick: FOUR, rim: [3, 6, 11, 14], clap: [6, 14], hat: E16, openHat: [10] },
    ],
    bass: { kind: "808", pats: [[0, 3, 8, 11], [0, 6, 8, 14], [0, 8]] },
    harm: { inst: ["pluck", "piano", "nylon"], comp: ["push", "offbeat", "arp8"] },
    pad: ["warm", null], lead: ["synth", "flute", "nylon", null],
    fx: { reverb: 0.22 },
  },
  cumbia: {
    bpm: [92, 100], keys: [57, 60, 62, 64], minor: false,
    progs: [[0, 4, 4, 0], [0, 3, 4, 0], [0, 4, 0, 4], [5, 4, 0, 0]],
    kit: "acoustic",
    drums: [
      { kick: [0, 8], snare: [4, 12], guiro: E8, conga: [6, 7, 14, 15], cowbell: [2, 10] },
      { kick: [0, 8], rim: [4, 12], guiro: E8, conga: [2, 6, 10, 14], shaker: E16 },
    ],
    bass: { kind: "sine", pats: [[0, 6, 8, 14], [0, 8]], alt: true },
    harm: { inst: ["accordion", "guitar"], comp: ["offbeat", "strum"] },
    pad: [null], lead: ["accordion", "flute"],
    fx: { reverb: 0.16 },
  },
  norteno: {
    bpm: [112, 126], keys: [55, 57, 60, 62], minor: false,
    progs: [[0, 4, 4, 0], [0, 3, 4, 0], [0, 0, 4, 4]],
    kit: "acoustic",
    drums: [
      { kick: [0, 8], snare: [4, 12], hat: [] },
      { kick: [0, 8], snare: [4, 12], rim: [14] },
    ],
    bass: { kind: "pick", pats: [[0, 8]], alt: true },
    harm: { inst: ["guitar", "accordion"], comp: ["oompah"] },
    pad: [null], lead: ["accordion"],
    leadRhythms: [[0, 2, 4, 6, 8, 10, 12], [0, 3, 4, 6, 8, 11, 12, 14], [0, 2, 3, 4, 8, 10, 12]],
    fx: { reverb: 0.14 },
  },
  bossa: {
    bpm: [118, 134], keys: [57, 60, 62, 65], minor: false, sevenths: true,
    progs: [[1, 4, 0, 0], [0, 5, 1, 4], [0, 3, 1, 4]],
    kit: "brush",
    drums: [{ kick: [0, 6, 8, 14], rim: [0, 3, 6, 10, 13], ride: E8 }, { kick: [0, 8], rim: [3, 6, 10, 12], ride: E8, shaker: E16 }],
    bass: { kind: "upright", pats: [[0, 6, 8, 14]], alt: true },
    harm: { inst: ["nylon", "rhodes"], comp: ["bossa"] },
    pad: [null, "warm"], lead: ["flute", "vibes", "whistle"],
    fx: { reverb: 0.25 },
  },
  lofi: {
    bpm: [72, 86], keys: [60, 62, 63, 65], minor: false, sevenths: true, swing: 0.22,
    progs: [[1, 4, 0, 5], [3, 2, 1, 4], [0, 5, 1, 4], [5, 4, 3, 2]],
    kit: "acoustic",
    drums: [
      { kick: [0, 7, 10], snare: [4, 12], hat: E8 },
      { kick: [0, 3, 10], snare: [4, 12], hat: E8, shaker: OFF8 },
    ],
    bass: { kind: "sine", pats: [[0, 10], [0, 7, 10], [0, 8]] },
    harm: { inst: ["rhodes", "piano", "nylon"], comp: ["block", "push"] },
    pad: [null, "warm"], lead: ["flute", "vibes", null],
    fx: { lofi: true, vinyl: true, reverb: 0.25 },
  },
  acustico: {
    bpm: [92, 108], keys: [55, 57, 60, 62], minor: false, swing: 0.08,
    progs: [[0, 3, 5, 4], [0, 4, 5, 3], [0, 5, 3, 4]],
    kit: "acoustic",
    drums: [{ kick: [0, 8], snare: [4, 12], shaker: E16 }, { kick: [0, 10], rim: [4, 12], shaker: E8 }],
    bass: { kind: "upright", pats: [[0, 8], [0, 6, 8]], alt: true },
    harm: { inst: ["guitar", "nylon"], comp: ["strum", "arp8"] },
    pad: [null, "warm"], lead: [null, "whistle", "piano"],
    fx: { reverb: 0.2 },
  },
  inspirador: {
    bpm: [80, 96], keys: [60, 62, 64, 65, 67], minor: false,
    progs: [[0, 4, 5, 3], [5, 3, 0, 4], [3, 0, 4, 5], [0, 5, 3, 4]],
    kit: "electro", intro: "soft",
    drums: [{ kick: [0, 8], clap: [12] }, { kick: [0, 6, 8], snare: [4, 12], hat: E8 }],
    bass: { kind: "sub", pats: [[0], [0, 8]] },
    harm: { inst: ["piano"], comp: ["arp8", "arp16"] },
    pad: ["strings", "choir", "warm"], lead: ["piano", "bell", null],
    fx: { reverb: 0.4, riser: true },
  },
  romantico: {
    bpm: [64, 76], keys: [60, 62, 63, 65, 67], minor: false, sevenths: true,
    progs: [[0, 5, 3, 4], [0, 2, 3, 4], [3, 4, 2, 5]],
    kit: "brush", intro: "soft",
    drums: [{ kick: [0], ride: E8 }, { kick: [0, 8], rim: [12] }],
    bass: { kind: "upright", pats: [[0], [0, 8]] },
    harm: { inst: ["piano", "nylon"], comp: ["arp8", "block"] },
    pad: ["strings", "warm"], lead: ["piano", "flute", "nylon"],
    fx: { reverb: 0.4 },
  },
  electronica: {
    bpm: [122, 128], keys: [53, 55, 57, 58], minor: true,
    progs: [[0, 5, 2, 6], [0, 6, 5, 4], [5, 6, 0, 0], [0, 3, 6, 5]],
    kit: "electro",
    drums: [
      { kick: FOUR, clap: [4, 12], hat: [1, 3, 5, 7, 9, 11, 13, 15], openHat: OFF8 },
      { kick: FOUR, clap: [4, 12], hat: E16, openHat: OFF8 },
    ],
    bass: { kind: "synth", pats: [OFF8, [2, 3, 6, 7, 10, 11, 14, 15], E16], cutoff: 650 },
    harm: { inst: ["stabs", "supersaw", "pluck"], comp: ["stab4", "arp16", "pulse"] },
    pad: ["warm", "strings"], lead: [null, "synth", "bell"],
    fx: { sidechain: true, reverb: 0.25, riser: true },
  },
  hiphop: {
    bpm: [68, 78], keys: [53, 54, 55, 56, 58], minor: true,
    progs: [[0, 5, 6, 5], [0, 0, 5, 6], [0, 3, 5, 4]],
    kit: "808",
    drums: [
      { kick: [0, 7, 10], clap: [8], hat: E8, hatRoll: [12, 13, 14, 15] },
      { kick: [0, 3, 10], clap: [8], hat: E16, openHat: [6] },
      { kick: [0, 6, 11], snare: [8], hat: E8, hatRoll: [5, 13] },
    ],
    bass: { kind: "808", pats: [[0, 7, 10], [0, 3, 10], [0, 6, 11]] },
    harm: { inst: ["piano", "bell", "rhodes"], comp: ["block", "arp8"] },
    pad: ["choir", "strings", null], lead: [null, "bell", "flute"],
    fx: { reverb: 0.22 },
  },
  rock: {
    bpm: [110, 132], keys: [52, 55, 57, 59], minor: true,
    progs: [[0, 5, 6, 0], [0, 3, 5, 4], [0, 6, 3, 5]],
    kit: "acoustic",
    drums: [
      { kick: [0, 6, 8], snare: [4, 12], hat: E8 },
      { kick: [0, 3, 8, 10], snare: [4, 12], ride: E8 },
    ],
    bass: { kind: "synth", pats: [E8], cutoff: 900 },
    harm: { inst: ["power"], comp: ["pulse", "push"] },
    pad: [null], lead: [null, "synth"],
    fx: { reverb: 0.15, riser: true },
  },
  epico: {
    bpm: [84, 96], keys: [57, 60, 62, 64], minor: true,
    progs: [[0, 5, 2, 6], [0, 5, 3, 6], [0, 3, 6, 5]],
    kit: "acoustic",
    drums: [
      { kick: [0, 10], snare: [8], tom: [12, 13, 14, 15] },
      { kick: [0, 3, 8], snare: [4, 12], tom: [14, 15] },
    ],
    bass: { kind: "sub", pats: [[0], [0, 8]] },
    harm: { inst: ["piano", "brass"], comp: ["pulse", "arp8"] },
    pad: ["strings", "choir"], lead: ["horn", "trumpet"],
    fx: { reverb: 0.45, riser: true },
  },
  suspenso: {
    bpm: [80, 96], keys: [50, 52, 53, 55], minor: true,
    progs: [[0, 0, 5, 6], [0, 6, 5, 4], [0, 5, 0, 1]],
    kit: "electro", intro: "soft",
    drums: [{ kick: [0, 8], hat: E16 }, { kick: [0, 10], rim: [4, 12], hat: E8 }],
    bass: { kind: "sub", pats: [E8, E16] },
    harm: { inst: ["pluck", "piano"], comp: ["arp16", "pulse"], octave: 12 },
    pad: ["choir", "strings"], lead: [null, "piano", "bell"],
    fx: { reverb: 0.45, riser: true },
  },
};

// ---------------- Utilidades de música ----------------

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
const pickFrom = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length) % list.length];

function scaleNote(root: number, minor: boolean, idx: number) {
  const sc = minor ? MINOR : MAJOR;
  return root + sc[((idx % 7) + 7) % 7] + 12 * Math.floor(idx / 7);
}
function chordOf(root: number, minor: boolean, degree: number, size: number) {
  return Array.from({ length: size }, (_, k) => scaleNote(root, minor, degree + k * 2));
}
// Acomoda las notas del acorde cerca de un centro (así los cambios de acorde suenan suaves).
function voice(ch: number[], center: number) {
  return ch.map((m) => {
    while (m < center - 6) m += 12;
    while (m > center + 6) m -= 12;
    return m;
  }).sort((a, b) => a - b);
}

// ---------------- Lo que elige cada versión ----------------

type Choice = {
  def: Def;
  bpm: number;
  root: number;
  prog: number[];
  drums: DrumPat;
  bassPat: number[];
  inst: Inst;
  comp: Comp;
  pad: Pad | null;
  lead: Lead | null;
  rhythm: number[];
  arp: number[];
  form: string;
};

const LEAD_RHYTHMS = [
  [0, 3, 6, 8, 10, 12],
  [0, 4, 6, 10, 12],
  [0, 2, 4, 8, 11, 14],
  [0, 6, 8, 12, 14],
  [0, 2, 3, 6, 8, 12],
  [0, 4, 8, 10, 12, 14],
];
const ARPS = [
  [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1],
  [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2],
  [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3],
  [2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1],
  [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 2, 3, 2],
];
const FORMS = ["VC", "VVCC", "CVC", "VCBC", "VCC"];

function choose(style: MusicStyleId, seed: number): Choice {
  const def = STYLES[style] || STYLES.pop;
  // La versión 1 usa lo más característico del estilo; las demás mezclan.
  const r = rng(seed * 7919 + style.length * 131 + 17);
  const first = seed <= 1;
  const p = <T,>(list: T[]) => (first ? list[0] : pickFrom(r, list));
  return {
    def,
    bpm: Math.round(first ? (def.bpm[0] + def.bpm[1]) / 2 : def.bpm[0] + r() * (def.bpm[1] - def.bpm[0])),
    root: p(def.keys),
    prog: p(def.progs),
    drums: p(def.drums),
    bassPat: p(def.bass.pats),
    inst: p(def.harm.inst),
    comp: p(def.harm.comp),
    pad: p(def.pad),
    lead: p(def.lead),
    rhythm: p(def.leadRhythms || LEAD_RHYTHMS),
    arp: p(ARPS),
    form: p(FORMS),
  };
}

const INST_NAME: Record<Inst | Lead, string> = {
  pluck: "sintetizador", rhodes: "piano eléctrico", piano: "piano", marimba: "marimba", stabs: "sintetizador", guitar: "guitarra",
  nylon: "guitarra clásica", ukulele: "ukulele", organ: "órgano", accordion: "acordeón", supersaw: "sintetizador", brass: "metales",
  power: "guitarra eléctrica", vibes: "vibráfono", bell: "campanas", flute: "flauta", horn: "cornos", synth: "sintetizador",
  whistle: "silbido", trumpet: "trompeta", xylo: "xilófono", glock: "glockenspiel",
};

// Descripción corta de la versión para mostrarla («Versión 3 · 104 BPM · piano y flauta»).
export function describeVersion(style: MusicStyleId, seed: number): string {
  const c = choose(style, seed);
  const a = tr(INST_NAME[c.inst]);
  const b = c.lead && INST_NAME[c.lead] !== INST_NAME[c.inst] ? tr(INST_NAME[c.lead]) : "";
  const en = getLang() === "en";
  return `${en ? "Version" : "Versión"} ${seed} · ${c.bpm} BPM · ${b ? `${a} ${en ? "and" : "y"} ${b}` : a}`;
}

// Secciones de la canción, compás por compás.
type BarRole = { sec: "I" | "V" | "C" | "B" | "O"; start: boolean; build: boolean };
function arrange(bars: number, form: string, intro: boolean): BarRole[] {
  const out: BarRole[] = [];
  if (bars <= 3) {
    for (let b = 0; b < bars; b++) out.push({ sec: "C", start: b === 0, build: false });
    return out;
  }
  const len = bars >= 16 ? 4 : 2;
  if (intro) out.push({ sec: "I", start: true, build: false });
  let k = 0;
  while (out.length < bars) {
    const s = form[k % form.length] as BarRole["sec"];
    for (let j = 0; j < len && out.length < bars; j++) out.push({ sec: s, start: j === 0, build: false });
    k++;
  }
  // El compás antes de cada coro prepara la entrada (redoble y subida).
  for (let b = 1; b < bars; b++) if (out[b].sec === "C" && out[b].start && out[b - 1].sec !== "C") out[b - 1].build = true;
  if (bars >= 6) out[bars - 1] = { sec: "O", start: true, build: false };
  return out;
}

// ---------------- Síntesis ----------------

export async function renderMusic(opts: { style: MusicStyleId; seed: number; duration: number; sampleRate?: number }): Promise<AudioBuffer> {
  const c = choose(opts.style, opts.seed);
  const def = c.def;
  const sr = opts.sampleRate || 44100;
  const dur = Math.max(2, opts.duration);
  const rand = rng(opts.seed * 104729 + 7);
  const minor = def.minor;
  const human = def.kit === "acoustic" || def.kit === "brush";
  const swing = def.swing || 0;

  const step = 60 / c.bpm / 4; // semicorchea
  const bar = step * 16;
  const bars = Math.ceil(dur / bar);
  const roles = arrange(bars, c.form, dur > bar * 3);

  // Motivo melódico: contorno de 2 compases que se repite con variaciones
  let pos = 8 + Math.floor(rand() * 2);
  const motif = Array.from({ length: c.rhythm.length * 2 }, () => {
    pos += Math.floor(rand() * 5) - 2;
    pos = Math.max(6, Math.min(13, pos));
    return pos;
  });
  const center = c.root + 12 + (def.harm.octave || 0);

  const SEG = 4;
  const TAIL = 3;
  const total = Math.ceil(sr * dur);
  const L = new Float32Array(total);
  const R = new Float32Array(total);

  // Respuesta de sala para la reverberación (se reutiliza en cada sección)
  const irLen = Math.floor(sr * 1.6);
  const irData = [new Float32Array(irLen), new Float32Array(irLen)];
  for (const ch of irData) for (let i = 0; i < irLen; i++) ch[i] = (rand() * 2 - 1) * Math.pow(1 - i / irLen, 4);

  const renderSegment = async (fromBar: number, toBar: number) => {
    const off = fromBar * bar;
    const segLen = Math.min(dur - off, (toBar - fromBar) * bar) + TAIL;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * segLen), sr);
    const master = ctx.createGain();
    master.gain.value = 0.8;
    if (def.fx?.lofi) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 4200;
      master.connect(lp).connect(ctx.destination);
    } else master.connect(ctx.destination);

    const rev = ctx.createConvolver();
    const irBuf = ctx.createBuffer(2, irLen, sr);
    irBuf.copyToChannel(irData[0], 0);
    irBuf.copyToChannel(irData[1], 1);
    rev.buffer = irBuf;
    const revGain = ctx.createGain();
    revGain.gain.value = def.fx?.reverb ?? 0.2;
    rev.connect(revGain).connect(master);

    const bus = (gain: number, pan = 0, send = 0) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      let out: AudioNode = g;
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        out = p;
      }
      out.connect(master);
      if (send) {
        const s = ctx.createGain();
        s.gain.value = send;
        out.connect(s).connect(rev);
      }
      return g;
    };
    const drumBus = bus(0.9);
    const roomBus = bus(0.5, 0, 0.6); // redoble y platillos con algo de sala
    const percBus = bus(0.42, 0.25, 0.3);
    const bassBus = bus(0.55);
    const harmBus = bus(0.32, -0.15, 0.8);
    const padBus = bus(0.15, 0.15, 1);
    const leadBus = bus(0.21, 0.1, 0.9);
    if (def.fx?.sidechain) {
      // La armonía «respira» con el bombo
      for (const [g, base, depth] of [[padBus, 0.1, 0.06], [harmBus, 0.24, 0.1]] as [GainNode, number, number][]) {
        g.gain.value = base;
        const lfo = ctx.createOscillator();
        lfo.type = "sawtooth";
        lfo.frequency.value = c.bpm / 60;
        const d = ctx.createGain();
        d.gain.value = depth;
        lfo.connect(d).connect(g.gain);
        lfo.start(0);
      }
    }
    // Distorsión para guitarras eléctricas
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    const driveOut = ctx.createGain();
    driveOut.gain.value = 0.35;
    shaper.connect(driveOut).connect(harmBus);

    const noise = ctx.createBuffer(1, sr, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noiseSrc = (t: number, len: number) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.start(t, Math.random() * 0.5, len + 0.05);
      return s;
    };
    const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    };
    const osc = (t: number, type: OscillatorType, f: number, end: number, dest: AudioNode, level = 1) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(end);
      return o;
    };
    const filtered = (t: number, len: number, type: BiquadFilterType, f: number, q: number, v: number, a: number, d: number, dest: AudioNode) => {
      const n = noiseSrc(t, len);
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      env(g, t, v, a, d);
      n.connect(fl).connect(g).connect(dest);
      return fl;
    };

    // ---------- Batería ----------
    const kick = (t: number, v: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      if (def.kit === "808") {
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.08);
        env(g, t, v, 0.003, 0.5);
      } else if (def.kit === "brush") {
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
        env(g, t, v * 0.6, 0.004, 0.25);
      } else if (def.kit === "acoustic") {
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
        env(g, t, v, 0.002, 0.3);
        filtered(t, 0.02, "highpass", 3000, 0.7, v * 0.25, 0.001, 0.012, drumBus); // golpe del parche
      } else {
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        env(g, t, v, 0.003, 0.35);
      }
      o.connect(g).connect(drumBus);
      o.start(t);
      o.stop(t + 0.7);
    };
    const snare = (t: number, v: number) => {
      if (def.kit === "brush") return void filtered(t, 0.35, "lowpass", 4500, 0.5, v * 0.45, 0.02, 0.25, roomBus);
      filtered(t, 0.25, "bandpass", def.kit === "acoustic" ? 2400 : 1900, 0.7, v, 0.002, def.kit === "acoustic" ? 0.2 : 0.17, roomBus);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
      const og = ctx.createGain();
      env(og, t, v * 0.55, 0.002, 0.08);
      o.connect(og).connect(drumBus);
      o.start(t);
      o.stop(t + 0.15);
    };
    const clap = (t: number, v: number) => {
      for (let k = 0; k < 3; k++) filtered(t + k * 0.011, 0.14, "bandpass", 1500, 1, v, 0.001, k === 2 ? 0.15 : 0.02, roomBus);
    };
    const rim = (t: number, v: number) => {
      const g = ctx.createGain();
      env(g, t, v * 0.35, 0.001, 0.03);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 1750;
      o.connect(g).connect(drumBus);
      o.start(t);
      o.stop(t + 0.06);
      filtered(t, 0.04, "highpass", 2500, 0.7, v * 0.3, 0.001, 0.025, drumBus);
    };
    const hat = (t: number, open: boolean, v: number) => filtered(t, open ? 0.3 : 0.06, "highpass", 7500, 0.7, v, 0.001, open ? 0.25 : 0.04, drumBus);
    const ride = (t: number, v: number) => {
      filtered(t, 0.5, "bandpass", 6500, 1.2, v, 0.001, 0.4, roomBus);
      const g = ctx.createGain();
      env(g, t, v * 0.12, 0.001, 0.5);
      const o = ctx.createOscillator();
      o.frequency.value = 3150;
      o.connect(g).connect(roomBus);
      o.start(t);
      o.stop(t + 0.6);
    };
    const crash = (t: number, v = 0.32) => filtered(t, 1.8, "highpass", 5000, 0.5, v, 0.002, 1.6, roomBus);
    const shaker = (t: number, v: number) => filtered(t, 0.08, "bandpass", 6000, 1.5, v, 0.01, 0.05, percBus);
    const conga = (t: number, f0: number, v: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0 * 1.15, t);
      o.frequency.exponentialRampToValueAtTime(f0, t + 0.03);
      env(g, t, v, 0.002, 0.22);
      o.connect(g).connect(percBus);
      o.start(t);
      o.stop(t + 0.3);
    };
    const cowbell = (t: number, v: number) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 800;
      const g = ctx.createGain();
      env(g, t, v, 0.001, 0.2);
      bp.connect(g).connect(percBus);
      osc(t, "square", 540, t + 0.25, bp, 0.6);
      osc(t, "square", 800, t + 0.25, bp, 0.6);
    };
    const clave = (t: number, v: number) => {
      const g = ctx.createGain();
      env(g, t, v, 0.001, 0.06);
      const o = ctx.createOscillator();
      o.frequency.value = 2500;
      o.connect(g).connect(percBus);
      o.start(t);
      o.stop(t + 0.1);
    };
    const guiro = (t: number, v: number, long: boolean) => {
      // Raspado: ráfagas rápidas de ruido
      const len = long ? 0.16 : 0.06;
      const n = noiseSrc(t, len);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3500;
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      const pulses = long ? 8 : 3;
      for (let k = 0; k < pulses; k++) {
        const tk = t + (k * len) / pulses;
        g.gain.setValueAtTime(v * (0.5 + 0.5 * (k / pulses)), tk);
        g.gain.setValueAtTime(0.0001, tk + len / pulses / 2);
      }
      n.connect(bp).connect(g).connect(percBus);
    };
    const sleigh = (t: number, v: number) => {
      for (let k = 0; k < 4; k++) filtered(t + k * 0.012, 0.06, "highpass", 8500, 0.7, v * (1 - k * 0.2), 0.001, 0.05, percBus);
    };
    const tom = (t: number, f0: number, v = 0.7) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.3);
      env(g, t, v, 0.003, 0.45);
      o.connect(g).connect(roomBus);
      o.start(t);
      o.stop(t + 0.55);
    };
    const riser = (t: number, len: number) => {
      const n = ctx.createBufferSource();
      n.buffer = noise;
      n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 2;
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + len);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
      n.connect(bp).connect(g).connect(roomBus);
      n.start(t);
      n.stop(t + len + 0.1);
    };

    // ---------- Instrumentos con cuerdas (Karplus-Strong) ----------
    const ksCache = new Map<string, AudioBuffer>();
    const pluckString = (t: number, m: number, v: number, kind: "guitar" | "nylon" | "ukulele" | "pick", dest: AudioNode) => {
      const f = hz(m);
      const key = `${kind}:${Math.round(f * 10)}`;
      let buf = ksCache.get(key);
      if (!buf) {
        const seconds = kind === "ukulele" ? 0.9 : kind === "pick" ? 1.1 : 1.8;
        const len = Math.floor(sr * seconds);
        buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        const N = Math.max(2, Math.round(sr / f));
        const ring = new Float32Array(N);
        for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
        const damp = kind === "ukulele" ? 0.496 : kind === "nylon" ? 0.4975 : kind === "pick" ? 0.4965 : 0.4985;
        let idx = 0;
        for (let i = 0; i < len; i++) {
          const nxt = (idx + 1) % N;
          d[i] = ring[idx];
          ring[idx] = damp * (ring[idx] + ring[nxt]);
          idx = nxt;
        }
        ksCache.set(key, buf);
      }
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = kind === "nylon" ? 2200 : kind === "ukulele" ? 4500 : kind === "pick" ? 1800 : 3200;
      const g = ctx.createGain();
      g.gain.value = v;
      s.connect(lp).connect(g).connect(dest);
      s.start(t);
    };

    // ---------- Instrumentos sintetizados ----------
    type Tone = Inst | Lead | Pad;
    const tone = (t: number, m: number, len: number, kind: Tone, v: number, dest: AudioNode) => {
      const f0 = hz(m);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6000;
      const parts: [OscillatorType, number, number][] = [];
      let attack = 0.005;
      let decay = len;
      let sustain = false;
      let vibrato = 0;
      let out: AudioNode = dest;
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
          parts.push(["triangle", 1, 1], ["sine", 2, 0.35], ["sine", 3, 0.12], ["sine", 4.01, 0.05]);
          lp.frequency.setValueAtTime(5000, t);
          lp.frequency.exponentialRampToValueAtTime(1400, t + 0.7);
          decay = Math.max(1.2, Math.min(2.4, len * 1.5));
          break;
        case "marimba":
          parts.push(["sine", 1, 1], ["sine", 4, 0.3]);
          decay = 0.35;
          break;
        case "xylo":
          parts.push(["sine", 1, 1], ["sine", 3.93, 0.4], ["sine", 9.8, 0.1]);
          decay = 0.28;
          break;
        case "vibes":
          parts.push(["sine", 1, 1], ["sine", 4, 0.12]);
          decay = 1.4;
          vibrato = 0.004;
          break;
        case "bell":
        case "glock":
          parts.push(["sine", 1, 1], ["sine", 2.01, 0.4], ["sine", 3.98, 0.15]);
          if (kind === "glock") parts.push(["sine", 5.4, 0.1]);
          decay = kind === "glock" ? 1.2 : 0.9;
          break;
        case "stabs":
          parts.push(["sawtooth", 1, 0.6], ["sawtooth", 1.006, 0.6]);
          lp.frequency.setValueAtTime(2800, t);
          lp.frequency.exponentialRampToValueAtTime(600, t + 0.2);
          decay = 0.22;
          break;
        case "supersaw":
          for (const d of [0.99, 0.995, 1, 1.005, 1.01]) parts.push(["sawtooth", d, 0.3]);
          lp.frequency.setValueAtTime(4500, t);
          lp.frequency.exponentialRampToValueAtTime(1800, t + Math.max(0.2, len));
          decay = Math.max(0.25, len);
          break;
        case "organ":
          parts.push(["sine", 1, 1], ["sine", 2, 0.6], ["sine", 3, 0.35], ["sine", 4, 0.2], ["sine", 0.5, 0.4]);
          attack = 0.01;
          sustain = true;
          vibrato = 0.003;
          break;
        case "accordion":
          parts.push(["sawtooth", 1, 0.45], ["square", 1.004, 0.3], ["sawtooth", 0.996, 0.35]);
          lp.frequency.value = 2600;
          attack = 0.03;
          sustain = true;
          break;
        case "brass":
        case "trumpet":
        case "horn":
          parts.push(["sawtooth", 1, 0.6], [kind === "horn" ? "sawtooth" : "square", kind === "horn" ? 0.5 : 1.002, 0.3]);
          lp.frequency.setValueAtTime(kind === "horn" ? 500 : 900, t);
          lp.frequency.linearRampToValueAtTime(kind === "horn" ? 1600 : 3200, t + 0.08);
          attack = kind === "horn" ? 0.12 : 0.04;
          sustain = true;
          vibrato = kind === "brass" ? 0 : 0.006;
          break;
        case "power":
          // acorde de quinta con distorsión
          parts.push(["sawtooth", 1, 0.5], ["sawtooth", 1.5, 0.4], ["sawtooth", 2, 0.3], ["square", 0.998, 0.3]);
          lp.frequency.value = 3200;
          sustain = true;
          attack = 0.004;
          out = shaper;
          break;
        case "synth":
          parts.push(["square", 1, 0.5], ["sawtooth", 1.004, 0.4]);
          lp.frequency.value = 2800;
          sustain = true;
          vibrato = 0.004;
          break;
        case "flute":
          parts.push(["sine", 1, 1], ["triangle", 2, 0.08]);
          lp.frequency.value = 3500;
          attack = 0.04;
          sustain = true;
          vibrato = 0.006;
          break;
        case "whistle":
          parts.push(["sine", 1, 1]);
          attack = 0.03;
          sustain = true;
          vibrato = 0.01;
          break;
        case "strings":
          parts.push(["sawtooth", 1, 0.5], ["sawtooth", 1.004, 0.5], ["sawtooth", 0.996, 0.5]);
          lp.frequency.value = 1400;
          attack = Math.min(0.6, len * 0.4);
          sustain = true;
          break;
        case "warm":
          parts.push(["triangle", 1, 0.6], ["triangle", 1.005, 0.6], ["sine", 0.5, 0.4]);
          lp.frequency.value = 1800;
          attack = Math.min(0.5, len * 0.35);
          sustain = true;
          break;
        case "choir": {
          // «Aaah»: sierras a través de dos formantes de voz
          parts.push(["sawtooth", 1, 0.5], ["sawtooth", 1.003, 0.5]);
          const f1 = ctx.createBiquadFilter();
          f1.type = "bandpass";
          f1.frequency.value = 750;
          f1.Q.value = 5;
          const f2 = ctx.createBiquadFilter();
          f2.type = "bandpass";
          f2.frequency.value = 1150;
          f2.Q.value = 6;
          const mix = ctx.createGain();
          mix.gain.value = 3;
          lp.connect(f1).connect(mix);
          lp.connect(f2).connect(mix);
          mix.connect(g);
          attack = Math.min(0.7, len * 0.4);
          sustain = true;
          vibrato = 0.004;
          break;
        }
        default:
          parts.push(["sine", 1, 1]);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + attack);
      if (sustain) {
        g.gain.setValueAtTime(v, t + Math.max(attack, len - 0.12));
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
      } else g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      if (kind !== "choir") lp.connect(g);
      g.connect(out);
      const end = t + (sustain ? len + 0.3 : attack + decay + 0.05);
      for (const [type, mul, lvl] of parts) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f0 * mul;
        if (vibrato) {
          const lfo = ctx.createOscillator();
          const lg = ctx.createGain();
          lfo.frequency.value = 5.2;
          lg.gain.setValueAtTime(0, t);
          lg.gain.linearRampToValueAtTime(f0 * mul * vibrato, t + Math.min(0.4, len * 0.5)); // vibrato que entra poco a poco
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

    // Toca un acorde con el instrumento de armonía (las cuerdas se rasguean)
    let strumDown = true;
    const playChord = (t: number, notes: number[], len: number, v: number, inst: Inst) => {
      if (inst === "guitar" || inst === "nylon" || inst === "ukulele") {
        const ns = inst === "ukulele" ? notes.map((m) => m + 12) : [notes[0] - 12, ...notes, notes[0] + 12];
        const order = strumDown ? ns : [...ns].reverse();
        strumDown = !strumDown;
        order.forEach((m, i) => pluckString(t + i * (inst === "nylon" ? 0.02 : 0.012), m, v * (strumDown ? 0.8 : 1), inst, harmBus));
        return;
      }
      if (inst === "power") return void tone(t, notes[0] - 12, len, "power", v * 1.6, harmBus);
      notes.forEach((m) => tone(t, m, len, inst, v / Math.sqrt(notes.length) * 1.5, harmBus));
    };

    const bassNote = (t: number, m: number, len: number, v = 0.9) => {
      const k = def.bass.kind;
      if (k === "pick") return void pluckString(t, m, v * 1.4, "pick", bassBus);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = def.bass.cutoff || (k === "upright" ? 900 : 700);
      lp.connect(g).connect(bassBus);
      const end = t + (k === "808" ? Math.max(0.5, len * 1.1) : len) + 0.05;
      const o = ctx.createOscillator();
      o.type = k === "synth" ? "sawtooth" : k === "upright" ? "triangle" : "sine";
      if (k === "808") {
        o.frequency.setValueAtTime(hz(m) * 2, t);
        o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.04);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v * 1.1, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, end - 0.02);
        lp.frequency.value = 400;
      } else {
        o.frequency.value = hz(m);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.008);
        if (k === "upright") g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.7, len + 0.2));
        else {
          g.gain.setValueAtTime(v, t + Math.max(0.02, len * 0.7));
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        }
      }
      o.connect(lp);
      o.start(t);
      o.stop(end);
      if (k === "sub" || k === "808") osc(t, "triangle", hz(m + 12), end, lp, 0.15);
    };

    // ---------- Composición compás por compás ----------
    for (let b = fromBar; b < toBar; b++) {
      const T0 = b * bar;
      if (T0 >= dur) break;
      const t0 = T0 - off; // tiempo local de la sección
      const role = roles[b];
      const sec = role.sec;
      const full = sec === "C";
      const lvl = sec === "I" ? 0 : sec === "B" ? 0.5 : sec === "O" ? 0.4 : full ? 2 : 1;
      const degree = c.prog[b % c.prog.length];
      const ch = voice(chordOf(c.root, minor, degree, def.sevenths ? 4 : 3), center);
      const bassRoot = chordOf(c.root, minor, degree, 1)[0] - 24;
      const fill = b % 4 === 3 && !role.build;
      const at = (s: number) => {
        const sw = s % 2 === 1 ? swing * step : 0;
        const h = human ? (rand() - 0.5) * 0.012 : 0;
        return Math.max(0, t0 + s * step + sw + h);
      };
      const vel = (v: number) => (human ? v * (0.86 + rand() * 0.24) : v);
      const inTime = (s: number) => T0 + s * step < dur;

      // Final: un acorde largo y un platillo
      if (sec === "O") {
        if (def.kit !== "none") {
          kick(at(0), 0.9);
          if (def.kit !== "brush") crash(at(0));
        }
        bassNote(at(0), bassRoot, bar * 0.9);
        playChord(at(0), ch, bar, 0.5, c.inst === "power" ? "power" : c.inst);
        if (c.pad) ch.forEach((m) => tone(at(0), m, bar, c.pad!, 0.3, padBus));
        continue;
      }

      // Batería
      const d = c.drums;
      const has = (k: keyof DrumPat, s: number) => !!d[k]?.includes(s);
      const softIntro = sec === "I" || (def.intro === "soft" && sec === "V" && b < 4);
      if (def.kit !== "none" && sec === "B") {
        // Puente: sin bombo ni bajo, solo un pulso suave para no perder el ritmo
        for (let s = 0; s < 16; s += 2) if (inTime(s) && (d.hat || d.ride || d.shaker || d.sleigh || d.guiro)) hat(at(s), false, vel(s % 4 === 0 ? 0.07 : 0.045));
        if (role.build && def.fx?.riser) for (let s = 8; s < 16; s++) if (inTime(s)) snare(at(s), 0.18 + (s - 8) * 0.05);
      }
      if (def.kit !== "none" && sec !== "B") {
        if (role.start && full && b > 0 && def.kit !== "brush") crash(at(0));
        for (let s = 0; s < 16; s++) {
          if (!inTime(s)) break;
          const t = at(s);
          const build2 = role.build && s >= 8;
          if (has("kick", s) && !(sec === "I" && s > 0) && !build2) kick(t, vel(def.fx?.lofi ? 0.7 : 0.95));
          if (sec === "I") continue;
          if (softIntro && def.intro === "soft") {
            if (has("hat", s) || has("ride", s)) hat(t, false, vel(0.06));
            continue;
          }
          if (has("snare", s) && !build2) snare(t, vel(def.fx?.lofi ? 0.35 : 0.55));
          if (has("clap", s) && !build2) clap(t, vel(0.45));
          if (has("rim", s)) rim(t, vel(0.5));
          if (has("hat", s)) hat(t, false, vel(def.fx?.lofi ? 0.09 : s % 4 === 0 ? 0.15 : 0.1));
          if (has("ride", s)) ride(t, vel(def.kit === "brush" ? 0.07 : 0.1));
          if (lvl >= 1.5 || def.kit === "808") {
            if (has("openHat", s)) hat(t, true, vel(0.11));
          }
          if (has("hatRoll", s)) for (let k = 0; k < 3; k++) hat(t + (k * step) / 3, false, vel(0.08));
          if (has("shaker", s)) shaker(t, vel(s % 2 ? 0.06 : 0.1));
          if (has("conga", s)) conga(t, s % 4 === 3 ? 260 : 190, vel(0.45));
          if (has("bongo", s)) conga(t, s % 8 === 1 ? 420 : 340, vel(0.35));
          if (has("cowbell", s) && lvl >= 1.5) cowbell(t, vel(0.18));
          if (has("clave", s)) clave(t, vel(0.3));
          if (has("guiro", s)) guiro(t, vel(0.12), s % 4 === 0);
          if (has("sleigh", s)) sleigh(t, vel(s % 4 === 0 ? 0.16 : 0.1));
          if (has("tom", s) && (fill || role.build)) tom(t, 150 - (s - 12) * 18);
          if (fill && !d.tom && s >= 13 && (d.snare || d.clap) && def.kit !== "808") snare(t, vel(0.28));
          if (role.build && def.kit !== "brush" && s >= 8) snare(t, 0.18 + (s - 8) * 0.05); // redoble
        }
        if (d.tom && b % 2 === 1 && sec !== "I") tom(at(8), 90, 0.75);
      }
      if (role.build && def.fx?.riser) riser(at(0), bar);

      // Bajo
      if (sec !== "I" && sec !== "B") {
        const pat = c.bassPat;
        pat.forEach((s, k) => {
          if (!inTime(s)) return;
          const next = pat[k + 1] ?? 16;
          let m = bassRoot;
          if (def.bass.alt && k % 2 === 1) m = bassRoot - 5; // raíz y quinta (abajo)
          if (def.bass.octaves && k % 2 === 1) m = bassRoot + 12;
          const len = def.bass.kind === "808" ? (next - s) * step : Math.min((next - s) * step * 0.9, step * 4);
          bassNote(at(s), m, len, vel(0.9));
        });
      }

      // Colchón (en la intro y el puente siempre hay uno, para que no queden huecos)
      const padKind: Pad | null = c.pad || (sec === "B" || sec === "I" ? "warm" : null);
      if (padKind && (lvl >= 1.5 || sec === "B" || sec === "I" || def.intro === "soft")) ch.forEach((m) => tone(at(0), m, bar, padKind, sec === "B" ? 0.9 : sec === "I" ? 0.55 : 0.32, padBus));

      // Armonía (más presente cuando no hay batería)
      const v = sec === "B" ? 1 : sec === "I" ? 0.7 : 0.42;
      const hit = (s: number, len: number, notes = ch) => inTime(s) && playChord(at(s), notes, len, vel(v), c.inst);
      switch (c.comp) {
        case "arp16":
        case "arp8": {
          const every = c.comp === "arp8" || sec === "I" ? 2 : 1;
          for (let s = 0; s < 16; s += every) {
            if (!inTime(s)) break;
            const m = ch[c.arp[s] % ch.length] + (c.inst === "piano" && s % 8 === 0 ? 0 : 12);
            if (c.inst === "guitar" || c.inst === "nylon" || c.inst === "ukulele") pluckString(at(s), m, vel(sec === "B" ? 0.8 : 0.4), c.inst, harmBus);
            else tone(at(s), m, step * every * 1.6, c.inst, vel((c.inst === "piano" ? 0.42 : 0.33) * (sec === "B" ? 2.2 : sec === "I" ? 1.5 : 1)), harmBus);
          }
          break;
        }
        case "block":
          hit(0, step * 8);
          if (sec !== "I") hit(c.inst === "rhodes" ? 7 : 8, step * 6);
          if (c.inst === "rhodes" && sec !== "I") hit(10, step * 4);
          break;
        case "offbeat":
          for (const s of OFF8) hit(s, step * 1.4);
          break;
        case "push":
          for (const s of [0, 3, 6, 10]) hit(s, step * 2.5);
          break;
        case "strum":
          for (const s of [0, 4, 6, 10, 12, 14]) hit(s, step * 2);
          break;
        case "oompah":
          for (const s of [4, 12]) hit(s, step * 1.5);
          if (sec !== "I") for (const s of [6, 14]) hit(s, step * 1.2);
          break;
        case "sustain":
          hit(0, bar);
          break;
        case "pulse":
          for (let s = 0; s < 16; s += 2) hit(s, step * 1.6);
          break;
        case "bossa":
          for (const s of [0, 3, 6, 10, 13]) hit(s, step * 2);
          break;
        case "stab4":
          for (const s of OFF8) hit(s, step);
          break;
      }

      // Melodía: pregunta (2 compases) y respuesta; más presente en el coro
      if (c.lead && sec !== "I" && b >= 1) {
        const half = b % 2;
        const phraseEnd = b % 4 === 3;
        c.rhythm.forEach((s, k) => {
          if (!inTime(s)) return;
          if (sec === "V" && k % 2 === 1 && rand() < 0.6) return; // en el verso, más espaciada
          if (sec === "B" && k % 2 === 1) return;
          let idx = motif[half * c.rhythm.length + k];
          if (phraseEnd && k === c.rhythm.length - 1) idx = 7; // resuelve a la tónica
          if (b % 4 === 2 && k >= c.rhythm.length - 2) idx += 1; // variación en la repetición
          let m = scaleNote(c.root, minor, idx);
          if (s % 4 === 0) {
            // en tiempos fuertes cae en una nota del acorde
            const tones = ch.flatMap((x) => [x, x + 12, x - 12, x + 24]);
            m = tones.reduce((a, x) => (Math.abs(x - m) < Math.abs(a - m) ? x : a), tones[0]);
          }
          const next = c.rhythm[k + 1] ?? 16;
          const lead = c.lead!;
          const short = lead === "bell" || lead === "glock" || lead === "xylo" || lead === "piano" || lead === "vibes";
          const len = (next - s) * step * (short ? 0.7 : 0.92);
          const lv = vel(lead === "horn" ? 0.3 : lead === "whistle" ? 0.22 : 0.3) * (full ? 1 : 0.85);
          if (lead === "nylon") pluckString(at(s), m, lv * 1.6, "nylon", leadBus);
          else tone(at(s), m, len, lead, lv, leadBus);
        });
      }
    }

    const out = await ctx.startRendering();
    const start = Math.round(off * sr);
    const l = out.getChannelData(0);
    const r = out.getChannelData(1);
    for (let i = 0; i < l.length && start + i < total; i++) {
      L[start + i] += l[i];
      R[start + i] += r[i];
    }
  };

  for (let s0 = 0; s0 < bars; s0 += SEG) await renderSegment(s0, Math.min(bars, s0 + SEG));

  // Textura lo-fi: crujido de vinilo
  if (def.fx?.vinyl)
    for (let i = 0; i < total; i++) {
      const cr = (Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.25 : 0) + (Math.random() * 2 - 1) * 0.002;
      L[i] += cr;
      R[i] += cr;
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
  const result = new AudioBuffer({ length: total, sampleRate: sr, numberOfChannels: 2 });
  result.copyToChannel(L, 0);
  result.copyToChannel(R, 1);
  normalize(result, 0.89);
  return result;
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
