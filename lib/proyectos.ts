// Proyectos del Creador de Reels: varios videos guardados en el dispositivo, con nombre.
// Un proyecto es una copia de todo lo que el Creador de Reels guarda mientras trabajas
// (las llaves «its-draft:reel:…»). El que está abierto vive en esas llaves, como siempre.
// Módulo puro: recibe el almacenamiento (localStorage) para poder probarlo.

export const MAX_PROYECTOS = 20;
const PREFIJO = "its-draft:reel:";
const LLAVE = "its-proyectos";
const CLIPS = `${PREFIJO}escenas-datos`;
const VOZ = `${PREFIJO}voz-archivo`;
const MAX_NOMBRE = 40;

export type Almacen = { length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
export type Proyecto = { id: string; nombre: string; actualizado: number; datos: Record<string, string> };
type Guardado = { activo: string; proyectos: Proyecto[] };

const nuevoId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const limpio = (nombre: string) => nombre.replace(/\s+/g, " ").trim().slice(0, MAX_NOMBRE);

// Lo que hay ahora mismo en el Creador de Reels
function capturar(a: Almacen): Record<string, string> {
  const datos: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const k = a.key(i);
    if (k && k.startsWith(PREFIJO)) datos[k] = a.getItem(k) ?? "";
  }
  return datos;
}

// Pone en el Creador de Reels los datos de un proyecto (y quita lo que hubiera)
function volcar(a: Almacen, datos: Record<string, string>) {
  for (const k of Object.keys(capturar(a))) a.removeItem(k);
  for (const [k, v] of Object.entries(datos)) a.setItem(k, v);
}

function leer(a: Almacen): Guardado | null {
  try {
    const g = JSON.parse(a.getItem(LLAVE) ?? "null") as Guardado | null;
    if (!g || !Array.isArray(g.proyectos) || g.proyectos.length === 0) return null;
    const proyectos = g.proyectos.filter((p) => p && typeof p.id === "string" && typeof p.nombre === "string" && p.datos && typeof p.datos === "object");
    if (proyectos.length === 0) return null;
    return { activo: proyectos.some((p) => p.id === g.activo) ? g.activo : proyectos[0].id, proyectos };
  } catch {
    return null;
  }
}
const escribir = (a: Almacen, g: Guardado) => a.setItem(LLAVE, JSON.stringify(g));

// Los proyectos guardados y cuál está abierto. La primera vez, el borrador que ya había pasa a ser «Mi video».
export function leerProyectos(a: Almacen): Guardado {
  const g = leer(a);
  if (g) return g;
  const id = nuevoId();
  const primero: Guardado = { activo: id, proyectos: [{ id, nombre: "Mi video", actualizado: Date.now(), datos: capturar(a) }] };
  escribir(a, primero);
  return primero;
}

// Copia lo que hay en pantalla al proyecto abierto
export function guardarActivo(a: Almacen): Guardado {
  const g = leerProyectos(a);
  const datos = capturar(a);
  const proyectos = g.proyectos.map((p) => (p.id === g.activo ? { ...p, datos, actualizado: Date.now() } : p));
  const nuevo = { ...g, proyectos };
  escribir(a, nuevo);
  return nuevo;
}

// Abre otro proyecto: guarda el actual y pone el elegido en el Creador de Reels
export function cambiarA(a: Almacen, id: string): boolean {
  const g = guardarActivo(a);
  const destino = g.proyectos.find((p) => p.id === id);
  if (!destino || id === g.activo) return false;
  volcar(a, destino.datos);
  escribir(a, { ...g, activo: id });
  return true;
}

// Crea un proyecto en blanco y lo abre. El actual queda guardado.
export function crearProyecto(a: Almacen, nombre = ""): { ok: true; id: string } | { ok: false; error: string } {
  const g = guardarActivo(a);
  if (g.proyectos.length >= MAX_PROYECTOS) return { ok: false, error: `Ya tienes ${MAX_PROYECTOS} videos guardados. Borra alguno para crear otro.` };
  const id = nuevoId();
  const p: Proyecto = { id, nombre: limpio(nombre) || `Video ${g.proyectos.length + 1}`, actualizado: Date.now(), datos: {} };
  volcar(a, {});
  escribir(a, { activo: id, proyectos: [...g.proyectos, p] });
  return { ok: true, id };
}

export function renombrarProyecto(a: Almacen, id: string, nombre: string) {
  const g = leerProyectos(a);
  const n = limpio(nombre);
  if (!n) return;
  escribir(a, { ...g, proyectos: g.proyectos.map((p) => (p.id === id ? { ...p, nombre: n } : p)) });
}

// Las fotos (y portadas) y los videos subidos que usa un proyecto. Los videos de la galería no son suyos.
export function archivosDe(datos: Record<string, string>): { fotos: string[]; videos: string[] } {
  let lista: unknown;
  try {
    lista = JSON.parse(datos[CLIPS] ?? "[]");
  } catch {
    lista = [];
  }
  const fotos: string[] = [];
  const videos: string[] = [];
  for (const c of Array.isArray(lista) ? lista : []) {
    if (!c || typeof c !== "object") continue;
    const { imageId, archivoId } = c as { imageId?: unknown; archivoId?: unknown };
    if (typeof imageId === "string" && imageId && !fotos.includes(imageId)) fotos.push(imageId);
    if (typeof archivoId === "string" && archivoId.startsWith("reelvid-") && !videos.includes(archivoId)) videos.push(archivoId);
  }
  // La voz en off generada se guarda como archivo: al borrar el proyecto también se va
  try {
    const voz = JSON.parse(datos[VOZ] ?? "null") as { id?: unknown } | null;
    if (voz && typeof voz.id === "string" && voz.id && !fotos.includes(voz.id)) fotos.push(voz.id);
  } catch {
    /* dato dañado: no hay voz que borrar */
  }
  return { fotos, videos };
}

// Borra un proyecto. Devuelve los archivos del dispositivo que ya nadie usa (para borrarlos).
// Si era el abierto, se abre otro; si era el único, queda uno nuevo en blanco.
export function borrarProyecto(a: Almacen, id: string): { archivos: string[] } {
  const g = guardarActivo(a);
  const victima = g.proyectos.find((p) => p.id === id);
  if (!victima) return { archivos: [] };
  let resto = g.proyectos.filter((p) => p.id !== id);
  const suyos = archivosDe(victima.datos);
  const ajenos = new Set(resto.flatMap((p) => [...archivosDe(p.datos).fotos, ...archivosDe(p.datos).videos]));
  const archivos = [...suyos.fotos, ...suyos.videos].filter((x) => !ajenos.has(x));
  let activo = g.activo;
  if (resto.length === 0) {
    const nuevo: Proyecto = { id: nuevoId(), nombre: "Mi video", actualizado: Date.now(), datos: {} };
    resto = [nuevo];
  }
  if (activo === id) {
    activo = resto[0].id;
    volcar(a, resto[0].datos);
  }
  escribir(a, { activo, proyectos: resto });
  return { archivos };
}

// Los videos subidos que usan los proyectos que no están abiertos (para no borrarlos al limpiar)
export function videosDeOtros(a: Almacen): string[] {
  const g = leer(a);
  if (!g) return [];
  return [...new Set(g.proyectos.filter((p) => p.id !== g.activo).flatMap((p) => archivosDe(p.datos).videos))];
}
