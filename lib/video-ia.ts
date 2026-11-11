import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { cuentasActivas, requireAccess } from "./account";
import { esCorreoAdmin } from "./account-api";
import { firestoreStore, type AccountStore } from "./account-store";
import { entradaDeModelo, enviarAFal, estadoFal, falConfigurado, resultadoFal, verificarFirmaFal, videoDe, type EntradaFal } from "./fal";
import {
  costoTomaCentavos,
  diaChicago,
  modeloDePlan,
  normalizarMovimiento,
  prioridadToma,
  puedeUsar,
  type PlanesConfig,
} from "./plans";
import { configR2, firmarUrl, llaveClip, negocioActivo, SIN_ALMACEN, subirDesdeUrl } from "./r2";
import type { SesionVerificada } from "./verify-token";
import { firestoreVideoStore, type EstadoTrabajo, type TrabajoVideo, type VideoStore } from "./video-store";

// Video con IA: cada toma de 5 s es un trabajo que pasa por una fila con prioridad, se manda a fal.ai,
// y fal avisa por webhook cuando termina. Aquí están las cuatro piezas: crear, despachar, aviso y consultar.
// Son funciones sin Response para poder probarlas; las rutas /api/video-ia solo las envuelven.

export const EN_PAUSA = "Los videos con IA están en pausa por ahora. Puedes generar el video con animación.";
const SEGUNDOS_ENLACE = 3600;
const MS_CANDADO = 30_000;
const CANDADO = "despacho_video";
const MAX_TOMAS = 4;
const MAX_CONSULTA = 10;

export type FalDeps = {
  enviar(modelo: string, input: EntradaFal, webhook: string): Promise<{ requestId: string; statusUrl: string; responseUrl: string }>;
  estado(statusUrl: string): Promise<string>;
  resultado(responseUrl: string): Promise<{ videoUrl: string } | null>;
  verificar(headers: Headers, cuerpo: string, ahora: number): Promise<boolean>;
};
export type R2Deps = {
  firmar(metodo: "GET" | "PUT", llave: string, segundos: number): string;
  subir(origen: string, llave: string, tipo: string): Promise<void>;
};

export type DepsVideo = {
  store?: AccountStore;
  videos?: VideoStore;
  now?: number;
  verify?: (token: string) => Promise<SesionVerificada>;
  stripeLive?: boolean;
  fal?: FalDeps;
  r2?: R2Deps | null; // null = almacenamiento sin configurar
  encendido?: boolean; // si no se pasa: VIDEO_IA distinto de "off" y hay FAL_KEY
  base?: string; // dirección pública de Studio, para el aviso de fal
};

export type Falla = { ok: false; status: number; error: string; codigo?: string };
const falla = (status: number, error: string, codigo?: string): Falla =>
  codigo ? { ok: false, status, error, codigo } : { ok: false, status, error };

// ¿Está encendida la IA de video? VIDEO_IA=off la apaga al instante; sin FAL_KEY tampoco hay.
export function videoIaEncendido(env: Record<string, string | undefined> = process.env): boolean {
  return (env.VIDEO_IA ?? "").trim().toLowerCase() !== "off" && !!(env.FAL_KEY ?? "").trim();
}

const limpiaUrl = (v: string | undefined) => (v ?? "").trim().replace(/\/+$/, "") || undefined;

// Dirección pública del sitio principal según Netlify (o STUDIO_URL si se define).
export function baseDeEntorno(env: Record<string, string | undefined> = process.env): string | undefined {
  return limpiaUrl(env.STUDIO_URL) ?? limpiaUrl(env.URL);
}

// Dirección a la que fal debe mandar el aviso: la MISMA versión del sitio que recibió el pedido
// (una versión de prueba tiene sus propios datos; si el aviso llegara al sitio principal se perdería).
// Solo se acepta el host del pedido si es de este sitio de Netlify; si no, se usa el sitio principal.
export function baseDePedido(req: Request, env: Record<string, string | undefined> = process.env): string {
  const fija = limpiaUrl(env.STUDIO_URL);
  if (fija) return fija;
  const principal = limpiaUrl(env.URL);
  if (!principal) return new URL(req.url).origin;
  const hostPrincipal = new URL(principal).host;
  const sitio = env.SITE_NAME ?? (/^([a-z0-9-]+)\.netlify\.app$/i.exec(hostPrincipal)?.[1] ?? "");
  const deEsteSitio = (host: string) =>
    host === hostPrincipal || (!!sitio && /^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(host) && host.endsWith(`--${sitio}.netlify.app`));
  // El host público puede venir en cualquiera de estos tres lugares, según cómo Netlify pase el pedido
  const candidatos = [req.headers.get("x-forwarded-host"), req.headers.get("host"), new URL(req.url).host];
  const host = candidatos.map((h) => (h ?? "").trim().toLowerCase()).find(deEsteSitio);
  return host ? `https://${host}` : principal;
}

type Mundo = {
  store: AccountStore;
  videos: VideoStore;
  ahora: number;
  fal: FalDeps;
  r2: R2Deps | null;
  encendido: boolean;
  base: string | undefined;
};

function mundoDe(deps: DepsVideo): Mundo {
  const cfgR2 = deps.r2 === undefined ? configR2() : null;
  return {
    store: deps.store ?? firestoreStore(),
    videos: deps.videos ?? firestoreVideoStore(),
    ahora: deps.now ?? Date.now(),
    fal: deps.fal ?? {
      enviar: (modelo, input, webhook) => enviarAFal(modelo, input, webhook),
      estado: (u) => estadoFal(u),
      resultado: (u) => resultadoFal(u),
      verificar: (h, c, ahora) => verificarFirmaFal(h, c, ahora),
    },
    r2:
      deps.r2 !== undefined
        ? deps.r2
        : cfgR2
          ? { firmar: (m, llave, s) => firmarUrl(m, llave, s, { cfg: cfgR2 }), subir: (o, llave, tipo) => subirDesdeUrl(o, llave, tipo, fetch, cfgR2) }
          : null,
    encendido: deps.encendido ?? (videoIaEncendido() && falConfigurado()),
    base: deps.base ?? baseDeEntorno(),
  };
}

// Mensaje corto para el registro: nunca claves, secretos ni enlaces firmados.
const motivo = (e: unknown) => (e instanceof Error ? e.message : "error").replace(/https?:\/\/\S+/g, "[enlace]").slice(0, 160);

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// Llave del caché: el negocio + la foto (su SHA-256) + el movimiento + el modelo.
export function llaveCache(negocioId: string, fotoSha: string, movimiento: string, modelo: string): string {
  return sha256([negocioId, fotoSha, normalizarMovimiento(movimiento), modelo].join("\n"));
}

// La foto debe ser del propio negocio (subida con /api/video-ia/subida). Devuelve su SHA-256 o null.
function fotoDelNegocio(imagenKey: string, negocioId: string): string | null {
  const m = /^(?:demo\/)?negocios\/([^/]+)\/fotos\/([0-9a-f]{64})\.(?:jpg|png|webp)$/.exec(imagenKey);
  return m && m[1] === negocioId ? m[2] : null;
}

type TomaPedida = { imagenKey: string; movimiento: string };
function tomasValidas(v: unknown): TomaPedida[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_TOMAS) return null;
  const r: TomaPedida[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") return null;
    const { imagenKey, movimiento } = t as Record<string, unknown>;
    if (typeof imagenKey !== "string" || typeof movimiento !== "string" || imagenKey.length > 300) return null;
    r.push({ imagenKey, movimiento: normalizarMovimiento(movimiento) });
  }
  return r;
}

export type TrabajoPublico = { id: string; estado: EstadoTrabajo; lugar?: number; clipUrl?: string; desdeCache?: boolean };

// Crea las tomas con IA de un video (de 1 a 4). Las que ya están en caché se entregan listas sin descontar.
export async function crearVideo(
  req: Request,
  datos: { tomas: unknown },
  deps: DepsVideo = {},
): Promise<{ ok: true; trabajos: { id: string; estado: EstadoTrabajo }[] } | Falla> {
  if (!cuentasActivas()) return falla(503, "Los videos con IA necesitan una cuenta de Studio.");
  const m = mundoDe(deps);
  if (!m.encendido) return falla(503, EN_PAUSA);
  if (!m.r2) return falla(503, SIN_ALMACEN);

  // Sesión y negocio (sin descontar todavía: primero hay que ver qué ya está en caché)
  const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  let uid = "";
  try {
    if (token) uid = (await (deps.verify ?? (await import("./verify-token")).verifyIdToken)(token)).uid;
  } catch {
    uid = "";
  }
  const quien = await negocioActivo(uid, { store: m.store, now: m.ahora, stripeLive: deps.stripeLive });
  if (!quien.ok) return quien;
  const { negocio, plan } = quien;
  const cfg = await m.store.getConfig();
  if (!puedeUsar(cfg, plan, "video_ia")) return falla(403, "Tu plan no incluye videos con IA.", "PLAN");

  const tomas = tomasValidas(datos.tomas);
  if (!tomas) return falla(400, "Elige de 1 a 4 fotos para las tomas con IA.");
  const nivel = modeloDePlan(plan);
  const modelo = cfg.videoIa.modelos[nivel].id;
  // En el caché cuenta también la resolución: el clip de la prueba (480P) no sirve para un plan de pago
  const modeloCache = `${modelo}@${cfg.videoIa.modelos[nivel].resolucion ?? ""}`;
  const preparadas: { toma: TomaPedida; cacheLlave: string; clipKey: string | null }[] = [];
  for (const toma of tomas) {
    const fotoSha = fotoDelNegocio(toma.imagenKey, negocio.id);
    if (!fotoSha) return falla(403, "Esa foto no es de tu cuenta. Súbela de nuevo.");
    const cacheLlave = llaveCache(negocio.id, fotoSha, toma.movimiento, modeloCache);
    preparadas.push({ toma, cacheLlave, clipKey: await m.videos.getCache(cacheLlave) });
  }

  // Cuota: solo las tomas nuevas. El guardián revisa sesión, plan y descuenta del mes o del saldo.
  const nuevas = preparadas.filter((p) => !p.clipKey).length;
  let delMes = 0;
  let mes = "";
  let devolver = async () => {};
  if (nuevas > 0) {
    const acceso = await requireAccess(
      req,
      { herramienta: "video_ia", contador: "tomas_ia", unidades: nuevas, clavePropia: false },
      { store: m.store, verify: deps.verify, now: m.ahora, stripeLive: deps.stripeLive },
    );
    if (!acceso.ok) return falla(acceso.status, acceso.mensaje, acceso.codigo);
    delMes = acceso.reserva?.delMes ?? 0;
    mes = acceso.mes ?? "";
    devolver = acceso.devolver;
  }

  const costo = costoTomaCentavos(cfg, nivel);
  const trabajos: TrabajoVideo[] = preparadas.map((p, i) => {
    const base = {
      id: randomUUID(),
      negocioId: negocio.id,
      uid,
      plan,
      nivel,
      modelo,
      imagenKey: p.toma.imagenKey,
      movimiento: p.toma.movimiento,
      intentos: 0,
      creado: m.ahora + i, // respeta el orden en que se pidieron
      actualizado: m.ahora,
      secreto: randomBytes(24).toString("hex"),
      cacheLlave: p.cacheLlave,
    };
    if (p.clipKey) {
      return { ...base, prioridad: prioridadToma(plan, false), estado: "listo", clipKey: p.clipKey, desdeCache: true, costoCentavos: 0, reserva: { mes: "", delMes: 0, delSaldo: 0 } };
    }
    // Cada toma recuerda de dónde salió (primero lo del mes, luego el saldo) para devolverla si falla
    const usaSaldo = delMes <= 0;
    if (!usaSaldo) delMes -= 1;
    return {
      ...base,
      prioridad: prioridadToma(plan, usaSaldo),
      estado: "en_fila",
      costoCentavos: costo,
      reserva: { mes, delMes: usaSaldo ? 0 : 1, delSaldo: usaSaldo ? 1 : 0 },
    };
  });
  try {
    await m.videos.crearTrabajos(trabajos);
  } catch (e) {
    await devolver(); // no quedó ningún trabajo: lo descontado regresa
    throw e;
  }
  // Los trabajos ya existen: pase lo que pase con el despacho, el navegador recibe sus ids
  let ahora = trabajos;
  try {
    if (nuevas > 0) await despacharCon(m);
    ahora = await m.videos.listarTrabajos(trabajos.map((t) => t.id));
  } catch (e) {
    console.error(`Video con IA: el despacho al crear falló (${motivo(e)}).`);
  }
  return { ok: true, trabajos: ahora.map((t) => ({ id: t.id, estado: t.estado })) };
}

// Manda a fal los trabajos que esperan turno, respetando prioridad, simultáneos y tope de gasto del día.
// También revisa los atorados. Se llama al crear, al recibir un aviso, al consultar y cada 5 min de respaldo.
export async function despachar(deps: DepsVideo = {}): Promise<{ enviados: number }> {
  return despacharCon(mundoDe(deps));
}

async function despacharCon(m: Mundo): Promise<{ enviados: number }> {
  // Sin cuentas no hay tomas con IA: no se toca la base de datos (el respaldo corre cada 5 min)
  if (!cuentasActivas()) return { enviados: 0 };
  if (!m.encendido || !m.r2) return { enviados: 0 };
  if (!(await m.videos.tomarCandado(CANDADO, MS_CANDADO, m.ahora))) return { enviados: 0 };
  let enviados = 0;
  try {
    const cfg = await m.store.getConfig();
    const v = cfg.videoIa;
    await revisarAtorados(m, cfg);
    if (!m.base) {
      console.error("Video con IA: falta la dirección pública de Studio (URL o STUDIO_URL); los trabajos se quedan en fila.");
      return { enviados: 0 };
    }
    const libres = v.simultaneos - (await m.videos.contarEnviados());
    if (libres <= 0) return { enviados: 0 };
    const dia = diaChicago(m.ahora);
    for (const t of await m.videos.trabajosEnFila(libres + 20)) {
      if (enviados >= libres) break;
      // El modelo y el precio son los de hoy (si el administrador los cambió, el trabajo en fila los toma)
      const costo = costoTomaCentavos(cfg, t.nivel);
      const tope = t.prioridad === 3 ? Math.floor(v.topeDiarioCentavos * v.umbralDemo) : v.topeDiarioCentavos;
      const r = await m.videos.marcarEnviado(t.id, { costo, dia, tope, simultaneos: v.simultaneos, ahora: m.ahora });
      if (r === "lleno") break;
      if (r !== "ok") continue; // tope del día (espera a mañana) o ya lo tomó otro despacho
      try {
        const imagen = m.r2.firmar("GET", t.imagenKey, SEGUNDOS_ENLACE);
        const webhook = `${m.base}/api/video-ia/aviso?t=${encodeURIComponent(t.id)}&s=${t.secreto}`;
        const mod = v.modelos[t.nivel];
        const e = await m.fal.enviar(mod.id, entradaDeModelo(mod, imagen, t.movimiento, v.segundosToma), webhook);
        await m.videos.guardarEnvio(t.id, { falRequestId: e.requestId, statusUrl: e.statusUrl, responseUrl: e.responseUrl });
        enviados += 1;
      } catch (e) {
        console.error(`Video con IA: no se pudo enviar el trabajo ${t.id} (${motivo(e)}).`);
        await reintentarOFallar(m, cfg, { ...t, estado: "enviado" }, undefined, motivo(e));
      }
    }
    return { enviados };
  } finally {
    await m.videos.soltarCandado(CANDADO);
  }
}

// Un envío que falló: vuelve a la fila si le quedan intentos; si no, falla y se devuelve la toma.
// En los dos casos su costo sale del gasto del día. Devuelve false si otro ya lo había resuelto.
async function reintentarOFallar(m: Mundo, cfg: PlanesConfig, t: TrabajoVideo, requestId?: string, error?: string): Promise<boolean> {
  const intentos = t.intentos + 1;
  const reintenta = intentos < cfg.videoIa.maxIntentos;
  const cambio = await m.videos.terminarTrabajo(
    t.id,
    { estado: reintenta ? "en_fila" : "fallo", intentos, actualizado: m.ahora, error },
    { requestId, devolverGasto: true },
  );
  if (cambio && !reintenta && t.reserva.delMes + t.reserva.delSaldo > 0) {
    await m.store.devolverUso(t.negocioId, t.reserva.mes, "tomas_ia", { delMes: t.reserva.delMes, delSaldo: t.reserva.delSaldo });
  }
  return cambio;
}

// El clip ya está en fal: se copia a R2 y el trabajo queda listo (y en caché). Lanza si R2 falla.
async function completar(m: Mundo, t: TrabajoVideo, videoUrl: string, requestId?: string): Promise<void> {
  if (!m.r2) throw new Error("R2 sin configurar");
  const clipKey = llaveClip(t.negocioId, t.plan, t.id);
  await m.r2.subir(videoUrl, clipKey, "video/mp4");
  if (await m.videos.terminarTrabajo(t.id, { estado: "listo", clipKey, actualizado: m.ahora }, { requestId })) {
    await m.videos.guardarCache(t.cacheLlave, clipKey);
  }
}

// Enviados hace más de N minutos sin aviso: se le pregunta a fal; si terminó se procesa, si no se reintenta.
async function revisarAtorados(m: Mundo, cfg: PlanesConfig): Promise<void> {
  const limite = m.ahora - cfg.videoIa.minutosAtorado * 60_000;
  for (const t of await m.videos.trabajosEnviados()) {
    if ((t.enviado ?? t.actualizado) > limite) continue;
    try {
      const terminado = t.statusUrl ? (await m.fal.estado(t.statusUrl)) === "COMPLETED" : false;
      const video = terminado && t.responseUrl ? await m.fal.resultado(t.responseUrl) : null;
      if (video) await completar(m, t, video.videoUrl, t.falRequestId);
      else await reintentarOFallar(m, cfg, t, t.falRequestId, `fal.ai no avisó en ${cfg.videoIa.minutosAtorado} minutos`);
    } catch (e) {
      console.error(`Video con IA: no se pudo revisar el trabajo atorado ${t.id} (${motivo(e)}).`);
    }
  }
}

const igual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// El aviso (webhook) de fal al terminar una toma. 401 sin firma válida; 404 si el trabajo o su secreto
// no coinciden; 500 si no se pudo guardar el clip (fal reintenta); en lo demás 200, también si es repetido.
export async function procesarAviso(url: URL, headers: Headers, cuerpo: string, deps: DepsVideo = {}): Promise<{ status: number }> {
  const m = mundoDe(deps);
  const id = url.searchParams.get("t") ?? "";
  const secreto = url.searchParams.get("s") ?? "";
  const t = id && secreto ? await m.videos.getTrabajo(id) : null;
  if (!t || !igual(secreto, t.secreto)) return { status: 404 };
  if (!(await m.fal.verificar(headers, cuerpo, m.ahora))) return { status: 401 };

  let aviso: { request_id?: unknown; status?: unknown; payload?: unknown; error?: unknown; payload_error?: unknown };
  try {
    aviso = JSON.parse(cuerpo) as typeof aviso;
  } catch {
    return { status: 200 };
  }
  const requestId = typeof aviso.request_id === "string" ? aviso.request_id : (headers.get("x-fal-webhook-request-id") ?? undefined);
  // Repetido, de un envío viejo o de un trabajo ya resuelto: nada que hacer
  if (t.estado !== "enviado" || (t.falRequestId && requestId !== t.falRequestId)) return { status: 200 };

  const video = aviso.status === "OK" ? videoDe(aviso.payload) : null;
  if (video) {
    try {
      await completar(m, t, video.videoUrl, requestId);
    } catch (e) {
      console.error(`Video con IA: no se pudo guardar el clip del trabajo ${t.id} (${motivo(e)}).`);
      return { status: 500 };
    }
  } else {
    const dicho = typeof aviso.error === "string" ? aviso.error : typeof aviso.payload_error === "string" ? aviso.payload_error : "";
    await reintentarOFallar(m, await m.store.getConfig(), t, requestId, motivo(new Error(dicho || "fal.ai terminó sin entregar el video")));
  }
  // Se liberó un lugar: que salga el siguiente de la fila
  try {
    await despacharCon(m);
  } catch (e) {
    console.error(`Video con IA: el despacho después del aviso falló (${motivo(e)}).`);
  }
  return { status: 200 };
}

// Estado de las tomas de un video, para quien es del negocio. También empuja la fila.
export async function consultar(
  uid: string,
  ids: string[],
  deps: DepsVideo = {},
): Promise<{ ok: true; trabajos: TrabajoPublico[]; topeHoy: boolean } | Falla> {
  if (!uid) return falla(401, "Inicia sesión para continuar.");
  if (ids.length < 1 || ids.length > MAX_CONSULTA || ids.some((i) => typeof i !== "string" || !i || i.length > 80)) {
    return falla(400, "Consulta no válida.");
  }
  const m = mundoDe(deps);
  const usuario = await m.store.getUsuario(uid);
  if (!usuario) return falla(403, "Crea tu cuenta para empezar.");
  const deEsteNegocio = async () => (await m.videos.listarTrabajos(ids)).filter((t) => t.negocioId === usuario.negocioId);
  let mios = await deEsteNegocio();
  // Solo se empuja la fila si alguna de mis tomas espera turno o lleva demasiado sin aviso
  // (cada empujón cuesta lecturas y escrituras de Firestore, y esto se consulta cada 5 s).
  const cfgV = (await m.store.getConfig()).videoIa;
  const viejo = m.ahora - cfgV.minutosAtorado * 60_000;
  if (mios.some((t) => t.estado === "en_fila" || (t.estado === "enviado" && (t.enviado ?? t.actualizado) <= viejo))) {
    try {
      await despacharCon(m);
      mios = await deEsteNegocio();
    } catch (e) {
      console.error(`Video con IA: el despacho al consultar falló (${motivo(e)}).`);
    }
  }
  const enFila = mios.some((t) => t.estado === "en_fila");
  const fila = enFila ? await m.videos.trabajosEnFila(200) : [];
  let topeHoy = false;
  if (enFila) {
    const cfg = await m.store.getConfig();
    const gasto = await m.videos.getGasto(diaChicago(m.ahora));
    topeHoy = mios.some((t) => {
      if (t.estado !== "en_fila") return false;
      const tope = t.prioridad === 3 ? Math.floor(cfg.videoIa.topeDiarioCentavos * cfg.videoIa.umbralDemo) : cfg.videoIa.topeDiarioCentavos;
      return gasto + costoTomaCentavos(cfg, t.nivel) > tope;
    });
  }
  const trabajos = mios.map((t): TrabajoPublico => {
    const r: TrabajoPublico = { id: t.id, estado: t.estado };
    if (t.estado === "en_fila") r.lugar = fila.findIndex((f) => f.id === t.id) + 1 || fila.length + 1;
    if (t.estado === "listo" && t.clipKey && m.r2) r.clipUrl = m.r2.firmar("GET", t.clipKey, SEGUNDOS_ENLACE);
    if (t.desdeCache) r.desdeCache = true;
    return r;
  });
  return { ok: true, trabajos, topeHoy };
}

// Resumen para el panel de administrador: gasto de hoy, cómo va la fila y los últimos fallos con su motivo.
export async function resumenVideo(
  adminEmail: string,
  emailVerified: boolean,
  deps: DepsVideo = {},
): Promise<
  | {
      ok: true;
      encendido: boolean;
      gastoHoyCentavos: number;
      topeCentavos: number;
      enProceso: number;
      enFila: number;
      fallos: { fecha: number; negocio: string; motivo: string }[];
    }
  | Falla
> {
  if (!esCorreoAdmin(adminEmail, emailVerified)) return falla(403, "No tienes permiso para el panel de administrador.", "NO_ADMIN");
  const m = mundoDe(deps);
  const cfg = await m.store.getConfig();
  const SEMANA = 7 * 24 * 60 * 60 * 1000;
  const [gasto, enProceso, fila, recientes] = await Promise.all([
    m.videos.getGasto(diaChicago(m.ahora)),
    m.videos.contarEnviados(),
    m.videos.trabajosEnFila(200),
    m.videos.trabajosDesde(m.ahora - SEMANA, 200),
  ]);
  const fallidos = recientes.filter((t) => t.estado === "fallo").slice(0, 10);
  const nombres = new Map<string, string>();
  for (const id of new Set(fallidos.map((t) => t.negocioId))) nombres.set(id, (await m.store.getNegocio(id))?.nombre ?? id);
  return {
    ok: true,
    encendido: m.encendido && !!m.r2,
    gastoHoyCentavos: gasto,
    topeCentavos: cfg.videoIa.topeDiarioCentavos,
    enProceso,
    enFila: fila.length,
    fallos: fallidos.map((t) => ({ fecha: t.actualizado, negocio: nombres.get(t.negocioId) ?? t.negocioId, motivo: t.error ?? "Sin detalle" })),
  };
}
