import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { baseDePedido, consultar, crearVideo, despachar, procesarAviso, type DepsVideo } from "./video-ia";
import type { Usuario } from "./account-store";
import { memoryStore } from "./account-store-memory";
import { memoryVideoStore } from "./video-store-memory";
import { DEFAULT_CONFIG, type Negocio } from "./plans";

const AHORA = Date.parse("2026-11-10T18:00:00Z");
const MES = "2026-11";
const HOY = "2026-11-10";
const MIN = 60 * 1000;
const MODELO = DEFAULT_CONFIG.videoIa.modelos.estandar.id;
const COSTO = 20; // centavos por toma de pago (768P)
const COSTO_DEMO = 13; // centavos por toma de la prueba (480P)
const foto = (letra: string, negocioId = "n1", demo = false) => `${demo ? "demo/" : ""}negocios/${negocioId}/fotos/${letra.repeat(64)}.jpg`;

function negocio(extra: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1", nombre: "Tortas", duenoUid: "u1", miembros: ["u1"], plan: "pro", estado: "activo", origen: "manual",
    pagadoHasta: AHORA + 30 * 24 * 60 * MIN, creado: AHORA, actualizado: AHORA, ...extra,
  };
}
const u1: Usuario = { uid: "u1", email: "d@x.com", negocioId: "n1", rol: "dueno", creado: AHORA };
const u2: Usuario = { uid: "u2", email: "otro@x.com", negocioId: "n2", rol: "dueno", creado: AHORA };
const PRUEBA = { estado: "prueba", plan: null, origen: null, pagadoHasta: undefined, pruebaHasta: AHORA + 5 * MIN } as const;

const verify = async (token: string) => {
  if (!token.startsWith("token-")) throw new Error("Token inválido");
  return { uid: token.slice(6), email: "x@x.com", emailVerified: true };
};
const req = (uid = "u1") => new Request("https://studio.example/api/video-ia", { method: "POST", headers: { Authorization: `Bearer token-${uid}` } });

// Mundo de prueba: almacenes en memoria, fal y R2 falsos.
function mundo(n1: Partial<Negocio> = {}, opciones: { gasto?: Record<string, number>; n2?: Partial<Negocio> } = {}) {
  const store = memoryStore({ usuarios: [u1, u2], negocios: [negocio(n1), negocio({ id: "n2", duenoUid: "u2", miembros: ["u2"], ...opciones.n2 })] });
  const videos = memoryVideoStore({ gasto: opciones.gasto });
  const enviados: { modelo: string; input: Record<string, unknown>; webhook: string; requestId: string }[] = [];
  const subidas: { origen: string; llave: string; tipo: string }[] = [];
  const estado = { falFalla: false, subirFalla: false, estadoFal: "IN_PROGRESS", firmaValida: true, now: AHORA };
  let n = 0;
  const deps: DepsVideo = {
    store,
    videos,
    verify,
    base: "https://studio.example",
    encendido: true,
    get now() {
      return estado.now;
    },
    fal: {
      async enviar(modelo, input, webhook) {
        if (estado.falFalla) throw new Error("fal.ai no aceptó el trabajo (500)");
        const requestId = `req-${++n}`;
        enviados.push({ modelo, input, webhook, requestId });
        return { requestId, statusUrl: `https://queue.fal.run/m/requests/${requestId}/status`, responseUrl: `https://queue.fal.run/m/requests/${requestId}` };
      },
      estado: async () => estado.estadoFal,
      resultado: async () => ({ videoUrl: "https://v3.fal.media/atorado.mp4" }),
      verificar: async () => estado.firmaValida,
    },
    r2: {
      firmar: (metodo, llave, segundos) => `https://r2.example/${llave}?m=${metodo}&s=${segundos}`,
      async subir(origen, llave, tipo) {
        if (estado.subirFalla) throw new Error("R2 caído");
        subidas.push({ origen, llave, tipo });
      },
    },
  };
  // El aviso que mandaría fal para el envío número i (0 = el primero)
  const aviso = (i: number, cuerpo: Record<string, unknown>) => {
    const e = enviados[i];
    return procesarAviso(new URL(e.webhook), new Headers(), JSON.stringify({ request_id: e.requestId, ...cuerpo }), deps);
  };
  const OK = { status: "OK", payload: { video: { url: "https://v3.fal.media/clip.mp4" } } };
  const ERROR = { status: "ERROR", error: "Invalid status code: 500", payload: null };
  return { store, videos, enviados, subidas, estado, deps, aviso, OK, ERROR };
}

let antes: string | undefined;
beforeEach(() => {
  antes = process.env.STUDIO_CUENTAS;
  process.env.STUDIO_CUENTAS = "on";
});
afterEach(() => {
  if (antes === undefined) delete process.env.STUDIO_CUENTAS;
  else process.env.STUDIO_CUENTAS = antes;
});

test("crear: 2 tomas en Pro se descuentan, se despachan al momento y suman al gasto del día", async () => {
  const m = mundo();
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "  Zoom   Lento " }, { imagenKey: foto("b"), movimiento: "paneo" }] }, m.deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.trabajos.map((t) => t.estado), ["enviado", "enviado"]);
  assert.equal(m.store.uso("n1", MES).tomas_ia, 2);
  assert.equal(await m.videos.getGasto(HOY), 2 * COSTO);
  assert.equal(m.enviados.length, 2);
  assert.equal(m.enviados[0].modelo, MODELO);
  assert.deepEqual(m.enviados[0].input, {
    image_url: `https://r2.example/${foto("a")}?m=GET&s=3600`, prompt: "zoom lento", duration: 5, resolution: "768P", prompt_expansion_mode: "balanced",
  });
  const t = (await m.videos.getTrabajo(r.trabajos[0].id))!;
  assert.equal(m.enviados[0].webhook, `https://studio.example/api/video-ia/aviso?t=${t.id}&s=${t.secreto}`);
  assert.equal(t.prioridad, 1);
  assert.equal(t.falRequestId, "req-1");
  assert.deepEqual(t.reserva, { mes: MES, delMes: 1, delSaldo: 0 });
  // La respuesta al navegador nunca trae el secreto
  assert.ok(!JSON.stringify(r).includes(t.secreto));
});

test("crear en la prueba gratis: modelo del demo, prioridad 3 y foto bajo demo/", async () => {
  const m = mundo(PRUEBA);
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a", "n1", true), movimiento: "" }] }, m.deps);
  assert.ok(r.ok);
  assert.equal(m.enviados[0].modelo, MODELO);
  assert.equal(m.enviados[0].input.resolution, "480P");
  const t = m.videos.todos()[0];
  assert.equal(t.prioridad, 3);
  assert.equal(t.costoCentavos, COSTO_DEMO);
  // La prueba solo incluye 1 toma
  const otra = await crearVideo(req(), { tomas: [{ imagenKey: foto("b", "n1", true), movimiento: "" }] }, m.deps);
  assert.ok(!otra.ok && otra.status === 429);
});

test("crear en Básico con saldo del paquete Video: prioridad 2 y sale del saldo", async () => {
  const m = mundo({ plan: "basico", paquetes: { tomas_ia: 20 } });
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "zoom" }] }, m.deps);
  assert.ok(r.ok);
  const t = m.videos.todos()[0];
  assert.equal(t.prioridad, 2);
  assert.deepEqual(t.reserva, { mes: MES, delMes: 0, delSaldo: 1 });
  assert.deepEqual((await m.store.getNegocio("n1"))?.paquetes, { tomas_ia: 19 });
});

test("VIDEO_IA apagado: crear responde 503 con el mensaje de pausa y despachar no envía", async () => {
  const m = mundo();
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, { ...m.deps, encendido: false });
  assert.deepEqual(r, { ok: false, status: 503, error: "Los videos con IA están en pausa por ahora. Puedes generar el video con animación." });
  assert.equal(m.store.uso("n1", MES).tomas_ia, 0);
  // Uno que ya estaba en fila tampoco sale
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, { ...m.deps, fal: { ...m.deps.fal!, enviar: async () => { throw new Error("x"); } } });
  const antesDe = m.enviados.length;
  assert.deepEqual(await despachar({ ...m.deps, encendido: false }), { enviados: 0 });
  assert.equal(m.enviados.length, antesDe);
});

test("crear rechaza: sin sesión 401, datos malos 400, foto de otro negocio 403, cuota agotada 429", async () => {
  const m = mundo({ plan: "basico" });
  const sin = await crearVideo(new Request("https://studio.example/api/video-ia", { method: "POST" }), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  assert.ok(!sin.ok && sin.status === 401);
  for (const tomas of [[], [1], [{ imagenKey: foto("a") }], [{ imagenKey: "x", movimiento: "" }], Array(5).fill({ imagenKey: foto("a"), movimiento: "" }), "no"]) {
    const r = await crearVideo(req(), { tomas } as never, m.deps);
    assert.ok(!r.ok && (r.status === 400 || r.status === 403), JSON.stringify(tomas));
  }
  const ajena = await crearVideo(req(), { tomas: [{ imagenKey: foto("a", "n2"), movimiento: "" }] }, m.deps);
  assert.ok(!ajena.ok && ajena.status === 403);
  const truco = await crearVideo(req(), { tomas: [{ imagenKey: `negocios/n1/fotos/../../n2/fotos/${"a".repeat(64)}.jpg`, movimiento: "" }] }, m.deps);
  assert.ok(!truco.ok && truco.status === 403);
  const agotada = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  assert.ok(!agotada.ok && agotada.status === 429 && agotada.codigo === "LIMITE");
  assert.equal(m.videos.todos().length, 0);
  assert.equal(m.enviados.length, 0);
});

test("doble despacho: dos a la vez no envían el mismo trabajo ni pasan de 3 simultáneos", async () => {
  // 4 trabajos que se quedaron en fila ayer por el tope del día
  const AYER = AHORA - 24 * 60 * MIN;
  const m = mundo({}, { gasto: { "2026-11-09": 500 } });
  m.estado.now = AYER;
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }, { imagenKey: foto("b"), movimiento: "" }] }, m.deps);
  await crearVideo(req(), { tomas: [{ imagenKey: foto("c"), movimiento: "" }, { imagenKey: foto("d"), movimiento: "" }] }, m.deps);
  assert.equal((await m.videos.trabajosEnFila(10)).length, 4);
  assert.equal(m.enviados.length, 0);
  m.estado.now = AHORA;
  const r = await Promise.all([despachar(m.deps), despachar(m.deps), despachar(m.deps)]);
  assert.equal(r.reduce((a, x) => a + x.enviados, 0), 3);
  assert.equal(m.enviados.length, 3);
  assert.equal(new Set(m.enviados.map((e) => e.webhook)).size, 3);
  assert.equal(await m.videos.contarEnviados(), 3);
  assert.equal(await m.videos.getGasto(HOY), 3 * COSTO);
  // Sin candado (ya libre), otro despacho tampoco pasa de 3
  assert.deepEqual(await despachar(m.deps), { enviados: 0 });
});

test("aviso OK: copia el clip a R2, queda listo, guarda caché y despacha el siguiente; repetido no hace nada", async () => {
  const m = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "zoom" }] }, m.deps);
  const id = m.videos.todos()[0].id;
  assert.deepEqual(await m.aviso(0, m.OK), { status: 200 });
  const t = (await m.videos.getTrabajo(id))!;
  assert.equal(t.estado, "listo");
  assert.equal(t.clipKey, `negocios/n1/clips/${id}.mp4`);
  assert.deepEqual(m.subidas, [{ origen: "https://v3.fal.media/clip.mp4", llave: `negocios/n1/clips/${id}.mp4`, tipo: "video/mp4" }]);
  assert.equal(await m.videos.getCache(t.cacheLlave), t.clipKey);
  assert.equal(await m.videos.getGasto(HOY), COSTO);
  // fal reenvía el mismo aviso
  assert.deepEqual(await m.aviso(0, m.OK), { status: 200 });
  assert.deepEqual(await m.aviso(0, m.ERROR), { status: 200 });
  assert.equal(m.subidas.length, 1);
  assert.equal((await m.videos.getTrabajo(id))?.estado, "listo");
  assert.equal(m.store.uso("n1", MES).tomas_ia, 1);
});

test("aviso falso: sin firma válida 401; con otro secreto o trabajo desconocido 404; no se toca nada", async () => {
  const m = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  const t = m.videos.todos()[0];
  m.estado.firmaValida = false;
  assert.deepEqual(await m.aviso(0, m.OK), { status: 401 });
  m.estado.firmaValida = true;
  const cuerpo = JSON.stringify({ request_id: "req-1", ...m.OK });
  const mal = new URL(`https://studio.example/api/video-ia/aviso?t=${t.id}&s=${"0".repeat(t.secreto.length)}`);
  assert.deepEqual(await procesarAviso(mal, new Headers(), cuerpo, m.deps), { status: 404 });
  const nadie = new URL(`https://studio.example/api/video-ia/aviso?t=no-existe&s=${t.secreto}`);
  assert.deepEqual(await procesarAviso(nadie, new Headers(), cuerpo, m.deps), { status: 404 });
  assert.deepEqual(await procesarAviso(new URL("https://studio.example/api/video-ia/aviso"), new Headers(), cuerpo, m.deps), { status: 404 });
  assert.equal((await m.videos.getTrabajo(t.id))?.estado, "enviado");
  assert.equal(m.subidas.length, 0);
});

test("aviso de un envío viejo (otro request_id) se ignora", async () => {
  const m = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  const t = m.videos.todos()[0];
  const r = await procesarAviso(new URL(m.enviados[0].webhook), new Headers(), JSON.stringify({ request_id: "req-viejo", ...m.OK }), m.deps);
  assert.deepEqual(r, { status: 200 });
  assert.equal((await m.videos.getTrabajo(t.id))?.estado, "enviado");
  assert.equal(m.subidas.length, 0);
});

test("fallo después de cobrar: 1 reintento; al segundo fallo devuelve la toma al mes y baja el gasto", async () => {
  const m = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  const id = m.videos.todos()[0].id;
  assert.equal(m.store.uso("n1", MES).tomas_ia, 1);
  assert.deepEqual(await m.aviso(0, m.ERROR), { status: 200 });
  // Reintento: se volvió a enviar (segundo envío) y sigue descontada
  let t = (await m.videos.getTrabajo(id))!;
  assert.equal(t.estado, "enviado");
  assert.equal(t.intentos, 1);
  assert.equal(t.falRequestId, "req-2");
  assert.equal(m.enviados.length, 2);
  assert.equal(await m.videos.getGasto(HOY), COSTO);
  assert.equal(m.store.uso("n1", MES).tomas_ia, 1);
  // Segundo fallo
  assert.deepEqual(await m.aviso(1, m.ERROR), { status: 200 });
  t = (await m.videos.getTrabajo(id))!;
  assert.equal(t.estado, "fallo");
  assert.equal(m.store.uso("n1", MES).tomas_ia, 0);
  assert.equal(await m.videos.getGasto(HOY), 0);
  assert.equal(m.enviados.length, 2);
  // Aviso repetido: no devuelve dos veces
  await m.aviso(1, m.ERROR);
  assert.equal(m.store.uso("n1", MES).tomas_ia, 0);
});

test("fallo con saldo de paquete: la toma regresa al saldo", async () => {
  const m = mundo({ plan: "basico", paquetes: { tomas_ia: 2 } });
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  assert.deepEqual((await m.store.getNegocio("n1"))?.paquetes, { tomas_ia: 1 });
  await m.aviso(0, m.ERROR);
  await m.aviso(1, m.ERROR);
  assert.deepEqual((await m.store.getNegocio("n1"))?.paquetes, { tomas_ia: 2 });
});

test("aviso OK sin video cuenta como fallo; si R2 falla responde 500 y el trabajo sigue enviado", async () => {
  const m = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  const id = m.videos.todos()[0].id;
  m.estado.subirFalla = true;
  assert.deepEqual(await m.aviso(0, m.OK), { status: 500 });
  assert.equal((await m.videos.getTrabajo(id))?.estado, "enviado");
  m.estado.subirFalla = false;
  assert.deepEqual(await m.aviso(0, { status: "OK", payload: null, payload_error: "x" }), { status: 200 });
  assert.equal((await m.videos.getTrabajo(id))?.intentos, 1);
});

test("fal no acepta el trabajo al despachar: reintenta una vez y luego falla devolviendo la toma", async () => {
  const m = mundo();
  m.estado.falFalla = true;
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  assert.ok(r.ok && r.trabajos[0].estado === "en_fila");
  assert.equal(await m.videos.getGasto(HOY), 0);
  await despachar(m.deps);
  const t = m.videos.todos()[0];
  assert.equal(t.estado, "fallo");
  assert.equal(m.store.uso("n1", MES).tomas_ia, 0);
});

test("tope del día: el trabajo se queda en fila y sale al día siguiente", async () => {
  const m = mundo({}, { gasto: { [HOY]: 490 } });
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  assert.ok(r.ok && r.trabajos[0].estado === "en_fila");
  assert.equal(m.enviados.length, 0);
  const c = await consultar("u1", [r.ok ? r.trabajos[0].id : ""], m.deps);
  assert.ok(c.ok && c.topeHoy === true);
  assert.deepEqual(c.ok && c.trabajos, [{ id: r.ok ? r.trabajos[0].id : "", estado: "en_fila", lugar: 1 }]);
  m.estado.now = AHORA + 24 * 60 * MIN;
  assert.deepEqual(await despachar(m.deps), { enviados: 1 });
  assert.equal(await m.videos.getGasto("2026-11-11"), COSTO);
});

test("tope del día: la prueba (demo) se detiene al 80% y los de pago siguen", async () => {
  const m = mundo(PRUEBA, { gasto: { [HOY]: 390 } });
  const demo = await crearVideo(req(), { tomas: [{ imagenKey: foto("a", "n1", true), movimiento: "" }] }, m.deps);
  assert.ok(demo.ok && demo.trabajos[0].estado === "en_fila"); // 390 + 13 > 400
  const pro = await crearVideo(req("u2"), { tomas: [{ imagenKey: foto("b", "n2"), movimiento: "" }] }, m.deps);
  assert.ok(pro.ok && pro.trabajos[0].estado === "enviado"); // 390 + 20 ≤ 500
  const c = await consultar("u1", [demo.ok ? demo.trabajos[0].id : ""], m.deps);
  assert.ok(c.ok && c.topeHoy === true);
});

test("caché por negocio: pedir lo mismo no descuenta ni llama a fal; otro negocio no recibe ese clip", async () => {
  const m = mundo();
  const toma = { imagenKey: foto("a"), movimiento: "Zoom lento" };
  await crearVideo(req(), { tomas: [toma] }, m.deps);
  await m.aviso(0, m.OK);
  const clip = m.videos.todos()[0].clipKey;
  const r = await crearVideo(req(), { tomas: [{ ...toma, movimiento: " zoom  LENTO" }, { imagenKey: foto("b"), movimiento: "" }] }, m.deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.trabajos.map((t) => t.estado), ["listo", "enviado"]);
  assert.equal(m.store.uso("n1", MES).tomas_ia, 2); // solo se descontó la toma nueva
  assert.equal(m.enviados.length, 2);
  const c = await consultar("u1", [r.trabajos[0].id], m.deps);
  assert.deepEqual(c.ok && c.trabajos, [{ id: r.trabajos[0].id, estado: "listo", clipUrl: `https://r2.example/${clip}?m=GET&s=3600`, desdeCache: true }]);
  // Solo caché (0 tomas nuevas): funciona aunque ya no quede cuota del mes
  await m.store.reservarUso("n1", MES, "tomas_ia", 18, 20);
  const gratis = await crearVideo(req(), { tomas: [toma] }, m.deps);
  assert.ok(gratis.ok && gratis.trabajos[0].estado === "listo");
  assert.equal(m.store.uso("n1", MES).tomas_ia, 20);
});

test("caché: la llave incluye el negocio (misma foto y movimiento en otro negocio se genera aparte)", async () => {
  const m = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "zoom" }] }, m.deps);
  await m.aviso(0, m.OK);
  const r = await crearVideo(req("u2"), { tomas: [{ imagenKey: foto("a", "n2"), movimiento: "zoom" }] }, m.deps);
  assert.ok(r.ok && r.trabajos[0].estado === "enviado");
  assert.equal(m.store.uso("n2", MES).tomas_ia, 1);
  const [a, b] = m.videos.todos();
  assert.notEqual(a.cacheLlave, b.cacheLlave);
});

test("atorado más de 15 min: si fal ya terminó se procesa; si no, se reintenta", async () => {
  const m = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }, { imagenKey: foto("b"), movimiento: "" }] }, m.deps);
  const [a, b] = m.videos.todos();
  m.estado.now = AHORA + 14 * MIN;
  await despachar(m.deps);
  assert.equal((await m.videos.getTrabajo(a.id))?.estado, "enviado"); // todavía no
  m.estado.now = AHORA + 16 * MIN;
  m.estado.estadoFal = "COMPLETED";
  await despachar(m.deps);
  assert.equal((await m.videos.getTrabajo(a.id))?.estado, "listo");
  assert.equal((await m.videos.getTrabajo(b.id))?.estado, "listo");
  assert.equal(m.subidas[0].origen, "https://v3.fal.media/atorado.mp4");
  // Otro que no termina: vuelve a enviarse con 1 intento
  const m2 = mundo();
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m2.deps);
  m2.estado.now = AHORA + 16 * MIN;
  await despachar(m2.deps);
  const t = m2.videos.todos()[0];
  assert.equal(t.estado, "enviado");
  assert.equal(t.intentos, 1);
  assert.equal(m2.enviados.length, 2);
  assert.equal(await m2.videos.getGasto(HOY), COSTO);
});

test("consultar: solo trabajos del propio negocio, con lugar en la fila; despacha si hay lugar", async () => {
  const m = mundo({}, { gasto: { [HOY]: 500 } });
  const mio = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }, { imagenKey: foto("b"), movimiento: "" }] }, m.deps);
  m.estado.now = AHORA + 1000;
  const ajeno = await crearVideo(req("u2"), { tomas: [{ imagenKey: foto("c", "n2"), movimiento: "" }] }, m.deps);
  assert.ok(mio.ok && ajeno.ok);
  if (!mio.ok || !ajeno.ok) return;
  const c = await consultar("u1", [mio.trabajos[1].id, ajeno.trabajos[0].id, "no-existe"], m.deps);
  assert.deepEqual(c.ok && c.trabajos, [{ id: mio.trabajos[1].id, estado: "en_fila", lugar: 2 }]);
  const sin = await consultar("", [mio.trabajos[0].id], m.deps);
  assert.ok(!sin.ok && sin.status === 401);
  const muchos = await consultar("u1", Array(11).fill("x"), m.deps);
  assert.ok(!muchos.ok && muchos.status === 400);
});

// ── Revisión final ───────────────────────────────────────────────────────────

test("si no se pueden guardar los trabajos, la toma descontada se devuelve", async () => {
  const m = mundo();
  const roto = { ...m.videos, crearTrabajos: async () => { throw new Error("Firestore caído"); } };
  await assert.rejects(crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, { ...m.deps, videos: roto }));
  assert.equal(m.store.uso("n1", MES).tomas_ia, 0);
});

test("si el despacho truena al crear, igual se devuelven los ids (las tomas quedan en fila)", async () => {
  const m = mundo();
  const roto = { ...m.videos, tomarCandado: async () => { throw new Error("Firestore caído"); } };
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, { ...m.deps, videos: roto });
  assert.ok(r.ok && r.trabajos[0].estado === "en_fila");
});

test("consultar no empuja la fila si mis tomas ya se están generando (cuida las lecturas de Firestore)", async () => {
  const m = mundo();
  const r = await crearVideo(req(), { tomas: [{ imagenKey: foto("a"), movimiento: "" }] }, m.deps);
  assert.ok(r.ok);
  let candados = 0;
  const contando = { ...m.videos, tomarCandado: async (...a: Parameters<typeof m.videos.tomarCandado>) => (candados++, m.videos.tomarCandado(...a)) };
  await consultar("u1", [r.ok ? r.trabajos[0].id : ""], { ...m.deps, videos: contando });
  assert.equal(candados, 0);
  // Pero sí cuando lleva más de 15 min sin aviso
  m.estado.now = AHORA + 16 * MIN;
  await consultar("u1", [r.ok ? r.trabajos[0].id : ""], { ...m.deps, videos: contando });
  assert.equal(candados, 1);
});

test("baseDePedido: el aviso de fal va a la misma versión del sitio que recibió el pedido", () => {
  const env = { URL: "https://innovationtech-studio.netlify.app" };
  const pedido = (host: string) => new Request("https://interno.example/api/video-ia", { headers: { "x-forwarded-host": host } });
  // Versión de prueba: NO debe irse al sitio principal
  assert.equal(baseDePedido(pedido("pruebas--innovationtech-studio.netlify.app"), env), "https://pruebas--innovationtech-studio.netlify.app");
  assert.equal(baseDePedido(pedido("innovationtech-studio.netlify.app"), env), "https://innovationtech-studio.netlify.app");
  // Un host ajeno (encabezado falsificado) no se usa: se queda con el sitio principal
  assert.equal(baseDePedido(pedido("malo.example"), env), "https://innovationtech-studio.netlify.app");
  assert.equal(baseDePedido(pedido("x--otro-sitio.netlify.app"), env), "https://innovationtech-studio.netlify.app");
  // STUDIO_URL manda
  assert.equal(baseDePedido(pedido("pruebas--innovationtech-studio.netlify.app"), { ...env, STUDIO_URL: "https://studio.mx/" }), "https://studio.mx");
  // Sin datos de Netlify (computadora local): el origen del pedido
  assert.equal(baseDePedido(new Request("http://localhost:3000/api/video-ia"), {}), "http://localhost:3000");
});

test("hasta 4 tomas con IA por video; la prueba y los planes de pago no comparten caché (otra resolución)", async () => {
  const m = mundo();
  const r = await crearVideo(req(), { tomas: ["a", "b", "c", "d"].map((l) => ({ imagenKey: foto(l), movimiento: "" })) }, m.deps);
  assert.ok(r.ok && r.trabajos.length === 4);
  assert.equal(m.store.uso("n1", MES).tomas_ia, 4);
  const demo = mundo(PRUEBA);
  await crearVideo(req(), { tomas: [{ imagenKey: foto("a", "n1", true), movimiento: "" }] }, demo.deps);
  assert.notEqual(demo.videos.todos()[0].cacheLlave, m.videos.todos()[0].cacheLlave);
});
