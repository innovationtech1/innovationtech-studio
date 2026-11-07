// Grabaciones reales de instrumentos para la música gratis.
// Los archivos viven en /public/samples (ver public/samples/CREDITOS.md para licencias).
// Se descargan solo los instrumentos que usa cada canción y quedan en memoria para las siguientes.

type Manifest = { melodic: Record<string, number[]>; oneshots: string[] };

export type SampleBank = {
  // Nota más cercana grabada (MIDI) y su audio, por instrumento
  notes: Map<string, { m: number; buf: AudioBuffer }[]>;
  shots: Map<string, AudioBuffer>;
  // Momento (segundos) del punto más fuerte de cada efecto, para que caiga justo en el tiempo
  peaks: Map<string, number>;
};

let manifest: Promise<Manifest | null> | null = null;
const decoded = new Map<string, Promise<AudioBuffer | null>>();
let decoder: BaseAudioContext | null = null;

function getDecoder() {
  if (!decoder) decoder = new OfflineAudioContext(1, 1, 44100);
  return decoder;
}

function getManifest() {
  if (!manifest)
    manifest = fetch("/samples/manifest.json")
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .catch(() => null);
  return manifest;
}

function load(path: string): Promise<AudioBuffer | null> {
  let p = decoded.get(path);
  if (!p) {
    p = fetch(path)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(
        (data) =>
          new Promise<AudioBuffer>((resolve, reject) => {
            // Forma con callbacks: también funciona en Safari antiguo
            const res = getDecoder().decodeAudioData(data, resolve, reject);
            if (res && typeof (res as Promise<AudioBuffer>).then === "function") (res as Promise<AudioBuffer>).then(resolve, reject);
          })
      )
      .catch(() => {
        decoded.delete(path); // se puede reintentar más tarde (por ejemplo, al volver la conexión)
        return null;
      });
    decoded.set(path, p);
  }
  return p;
}

function peakTime(buf: AudioBuffer) {
  const d = buf.getChannelData(0);
  let best = 0;
  let at = 0;
  for (let i = 0; i < d.length; i += 64) {
    const v = Math.abs(d[i]);
    if (v > best) {
      best = v;
      at = i;
    }
  }
  return at / buf.sampleRate;
}

// Carga los instrumentos y golpes pedidos. Lo que no se pueda descargar simplemente falta
// (la música usa entonces el sonido sintetizado de respaldo).
export async function loadBank(insts: string[], shots: string[]): Promise<SampleBank> {
  const bank: SampleBank = { notes: new Map(), shots: new Map(), peaks: new Map() };
  const man = await getManifest();
  if (!man) return bank;
  const jobs: Promise<void>[] = [];
  for (const inst of new Set(insts)) {
    const list = man.melodic[inst];
    if (!list) continue;
    jobs.push(
      Promise.all(list.map((m) => load(`/samples/${inst}/${m}.mp3`).then((buf) => (buf ? { m, buf } : null)))).then((res) => {
        const ok = res.filter((x): x is { m: number; buf: AudioBuffer } => !!x);
        if (ok.length) bank.notes.set(inst, ok);
      })
    );
  }
  for (const key of new Set(shots)) {
    if (!man.oneshots.includes(key)) continue;
    jobs.push(
      load(`/samples/oneshots/${key}.mp3`).then((buf) => {
        if (!buf) return;
        bank.shots.set(key, buf);
        bank.peaks.set(key, peakTime(buf));
      })
    );
  }
  await Promise.all(jobs);
  return bank;
}

// La grabación más cercana a la nota pedida
export function nearest(bank: SampleBank, inst: string, m: number) {
  const list = bank.notes.get(inst);
  if (!list) return null;
  let best = list[0];
  for (const x of list) if (Math.abs(x.m - m) < Math.abs(best.m - m)) best = x;
  return best;
}
