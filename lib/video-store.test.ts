import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryVideoStore } from "./video-store-memory";
import type { TrabajoVideo } from "./video-store";
import { colecciones } from "./colecciones";

const T0 = Date.parse("2026-11-10T18:00:00Z");
const DIA = "2026-11-10";

export function trabajo(extra: Partial<TrabajoVideo> = {}): TrabajoVideo {
  return {
    id: "t1", negocioId: "n1", uid: "u1", plan: "pro", prioridad: 1, nivel: "estandar", modelo: "fal-ai/modelo",
    imagenKey: `negocios/n1/fotos/${"a".repeat(64)}.jpg`, movimiento: "zoom lento", estado: "en_fila", intentos: 0,
    costoCentavos: 35, creado: T0, actualizado: T0, secreto: "s3creto", reserva: { mes: "2026-11", delMes: 1, delSaldo: 0 },
    cacheLlave: "llave1", ...extra,
  };
}

test("colecciones nuevas del video con IA usan el prefijo", () => {
  const c = colecciones();
  assert.equal(c.trabajosVideo, "studio_trabajos_video");
  assert.equal(c.cacheVideo, "studio_cache_video");
  assert.equal(c.gastoVideo, "studio_gasto_video");
  assert.equal(c.candados, "studio_candados");
});

test("la fila sale por prioridad y luego por antigüedad", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([
    trabajo({ id: "demo", prioridad: 3, creado: T0 }),
    trabajo({ id: "pro-nuevo", prioridad: 1, creado: T0 + 20 }),
    trabajo({ id: "saldo", prioridad: 2, creado: T0 + 5 }),
    trabajo({ id: "pro-viejo", prioridad: 1, creado: T0 + 10 }),
    trabajo({ id: "ya-listo", estado: "listo" }),
  ]);
  assert.deepEqual((await s.trabajosEnFila(10)).map((t) => t.id), ["pro-viejo", "pro-nuevo", "saldo", "demo"]);
  assert.deepEqual((await s.trabajosEnFila(2)).map((t) => t.id), ["pro-viejo", "pro-nuevo"]);
});

test("marcarEnviado: pasa a enviado y suma el costo al gasto del día", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo()]);
  assert.equal(await s.marcarEnviado("t1", { costo: 35, dia: DIA, tope: 500, simultaneos: 3, ahora: T0 + 1 }), "ok");
  const t = await s.getTrabajo("t1");
  assert.equal(t?.estado, "enviado");
  assert.equal(t?.enviado, T0 + 1);
  assert.equal(t?.diaGasto, DIA);
  assert.equal(await s.getGasto(DIA), 35);
  assert.equal(await s.contarEnviados(), 1);
});

test("marcarEnviado respeta el tope del día y no cambia nada", async () => {
  const s = memoryVideoStore({ gasto: { [DIA]: 480 } });
  await s.crearTrabajos([trabajo()]);
  assert.equal(await s.marcarEnviado("t1", { costo: 35, dia: DIA, tope: 500, simultaneos: 3, ahora: T0 }), "tope");
  assert.equal((await s.getTrabajo("t1"))?.estado, "en_fila");
  assert.equal(await s.getGasto(DIA), 480);
  // Justo al tope sí entra
  assert.equal(await s.marcarEnviado("t1", { costo: 20, dia: DIA, tope: 500, simultaneos: 3, ahora: T0 }), "ok");
});

test("marcarEnviado es atómico: dos a la vez sobre el mismo trabajo, solo una gana", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo()]);
  const o = { costo: 35, dia: DIA, tope: 500, simultaneos: 3, ahora: T0 };
  const r = await Promise.all([s.marcarEnviado("t1", o), s.marcarEnviado("t1", o)]);
  assert.deepEqual(r.sort(), ["no_en_fila", "ok"]);
  assert.equal(await s.getGasto(DIA), 35);
});

test("marcarEnviado no pasa de los simultáneos", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo({ id: "a" }), trabajo({ id: "b" }), trabajo({ id: "c" })]);
  const o = { costo: 35, dia: DIA, tope: 500, simultaneos: 2, ahora: T0 };
  const r = await Promise.all(["a", "b", "c"].map((id) => s.marcarEnviado(id, o)));
  assert.deepEqual(r, ["ok", "ok", "lleno"]);
  assert.equal(await s.getGasto(DIA), 70);
});

test("terminarTrabajo: solo si sigue enviado; la segunda vez devuelve false", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo()]);
  assert.equal(await s.terminarTrabajo("t1", { estado: "listo" }), false); // todavía en fila
  await s.marcarEnviado("t1", { costo: 35, dia: DIA, tope: 500, simultaneos: 3, ahora: T0 });
  assert.equal(await s.terminarTrabajo("t1", { estado: "listo", clipKey: "c.mp4", actualizado: T0 + 9 }), true);
  assert.equal(await s.terminarTrabajo("t1", { estado: "fallo" }), false);
  const t = await s.getTrabajo("t1");
  assert.equal(t?.estado, "listo");
  assert.equal(t?.clipKey, "c.mp4");
  assert.equal(await s.getGasto(DIA), 35); // listo: el gasto se queda
});

test("terminarTrabajo con devolverGasto resta el costo del día en que se envió (nunca bajo 0)", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo()]);
  await s.marcarEnviado("t1", { costo: 35, dia: DIA, tope: 500, simultaneos: 3, ahora: T0 });
  assert.equal(await s.terminarTrabajo("t1", { estado: "en_fila", intentos: 1 }, { devolverGasto: true }), true);
  assert.equal(await s.getGasto(DIA), 0);
  assert.equal((await s.getTrabajo("t1"))?.estado, "en_fila");
});

test("terminarTrabajo con requestId: ignora el aviso de un envío viejo", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo()]);
  await s.marcarEnviado("t1", { costo: 35, dia: DIA, tope: 500, simultaneos: 3, ahora: T0 });
  await s.guardarEnvio("t1", { falRequestId: "req-2", statusUrl: "https://s", responseUrl: "https://r" });
  assert.equal(await s.terminarTrabajo("t1", { estado: "listo" }, { requestId: "req-1" }), false);
  assert.equal(await s.terminarTrabajo("t1", { estado: "listo" }, { requestId: "req-2" }), true);
});

test("listarTrabajos devuelve solo los que existen; son copias", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo({ id: "a" }), trabajo({ id: "b" })]);
  const l = await s.listarTrabajos(["b", "x", "a"]);
  assert.deepEqual(l.map((t) => t.id), ["b", "a"]);
  l[0].estado = "fallo";
  assert.equal((await s.getTrabajo("b"))?.estado, "en_fila");
});

test("caché: guarda y lee la llave del clip (con cuándo se guardó)", async () => {
  const s = memoryVideoStore();
  assert.equal(await s.getCache("k", T0), null);
  await s.guardarCache("k", "negocios/n1/clips/t1.mp4", T0);
  assert.deepEqual(await s.getCache("k", T0 + 1000), { clipKey: "negocios/n1/clips/t1.mp4", creado: T0 });
});

test("caché: un clip de demo/ de más de 29 días ya no sirve (R2 lo borra a los 30); los demás sí", async () => {
  const s = memoryVideoStore();
  const DIA_MS = 24 * 60 * 60 * 1000;
  await s.guardarCache("demo", "demo/negocios/n1/clips/t1.mp4", T0);
  await s.guardarCache("pago", "negocios/n1/clips/t2.mp4", T0);
  assert.ok(await s.getCache("demo", T0 + 28 * DIA_MS));
  assert.equal(await s.getCache("demo", T0 + 29 * DIA_MS + 1), null);
  assert.ok(await s.getCache("pago", T0 + 400 * DIA_MS));
});

test("candado: exclusivo hasta soltarlo o hasta que vence", async () => {
  const s = memoryVideoStore();
  const a = await s.tomarCandado("despacho", 10_000, T0);
  assert.ok(a);
  assert.equal(await s.tomarCandado("despacho", 10_000, T0 + 1), null);
  const b = await s.tomarCandado("despacho", 10_000, T0 + 10_001); // venció
  assert.ok(b);
  await s.soltarCandado("despacho", b!);
  assert.ok(await s.tomarCandado("despacho", 10_000, T0 + 10_002));
});

test("candado: quien lo perdió (venció y lo tomó otro) no puede soltar el del otro", async () => {
  const s = memoryVideoStore();
  const viejo = await s.tomarCandado("despacho", 10_000, T0);
  const nuevo = await s.tomarCandado("despacho", 10_000, T0 + 10_001);
  assert.ok(viejo && nuevo && viejo !== nuevo);
  await s.soltarCandado("despacho", viejo!); // el primero termina tarde
  assert.equal(await s.tomarCandado("despacho", 10_000, T0 + 10_002), null); // el segundo lo sigue teniendo
});

test("trabajosDesde: los actualizados desde una fecha, del más nuevo al más viejo", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo({ id: "viejo", actualizado: T0 - 1000 }), trabajo({ id: "a", actualizado: T0 + 5 }), trabajo({ id: "b", actualizado: T0 + 9 })]);
  assert.deepEqual((await s.trabajosDesde(T0, 10)).map((t) => t.id), ["b", "a"]);
  assert.deepEqual((await s.trabajosDesde(T0, 1)).map((t) => t.id), ["b"]);
});

test("crearTrabajos con cupo del día: suma al contador en la misma operación y no pasa del límite", async () => {
  const s = memoryVideoStore();
  const cupo = { negocioId: "n1", dia: DIA, nuevas: 2, limite: 3 };
  assert.equal(await s.crearTrabajos([trabajo({ id: "a" }), trabajo({ id: "b" })], cupo), "ok");
  assert.equal(await s.tomasDelDia("n1", DIA), 2);
  // 2 + 2 > 3: no se crea ninguno ni cambia el contador
  assert.equal(await s.crearTrabajos([trabajo({ id: "c" }), trabajo({ id: "d" })], cupo), "limite");
  assert.equal(await s.tomasDelDia("n1", DIA), 2);
  assert.equal(await s.getTrabajo("c"), null);
  // Otro negocio u otro día: su propio contador
  assert.equal(await s.tomasDelDia("n2", DIA), 0);
  assert.equal(await s.tomasDelDia("n1", "2026-11-11"), 0);
  // Una que falló (y se devolvió) deja de contar
  await s.restarTomaDelDia("n1", DIA);
  assert.equal(await s.tomasDelDia("n1", DIA), 1);
  await s.restarTomaDelDia("n1", DIA);
  await s.restarTomaDelDia("n1", DIA);
  assert.equal(await s.tomasDelDia("n1", DIA), 0); // nunca negativo
});

test("contarEnFila cuenta sin traer los trabajos", async () => {
  const s = memoryVideoStore();
  await s.crearTrabajos([trabajo({ id: "a" }), trabajo({ id: "b" }), trabajo({ id: "c", estado: "listo" })]);
  assert.equal(await s.contarEnFila(), 2);
});
