import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cancelarInvitacion, crearCuenta, invitar, obtenerCuenta as obtener, quitarMiembro, type EstadoCuenta } from "./account-api";
import type { Usuario } from "./account-store";
import { memoryStore } from "./account-store-memory";
import { diaChicago, type Negocio } from "./plans";

const AHORA = Date.parse("2026-11-07T18:00:00Z");
const MIN = 60 * 1000;

function negocio(extra: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1",
    nombre: "Tortas",
    duenoUid: "u1",
    miembros: ["u1"],
    plan: "pro",
    estado: "activo",
    origen: "manual",
    pagadoHasta: AHORA + 30 * 24 * 60 * MIN,
    creado: AHORA - 60 * MIN,
    actualizado: AHORA - 60 * MIN,
    ...extra,
  };
}
const dueno: Usuario = { uid: "u1", email: "dueno@ejemplo.com", negocioId: "n1", rol: "dueno", creado: AHORA };
const miembro = (uid: string): Usuario => ({ uid, email: `${uid}@x.com`, negocioId: "n1", rol: "miembro", creado: AHORA });

type ConCuenta = Extract<EstadoCuenta, { negocio: unknown }>;
// Pide la cuenta y comprueba que existe (para que TypeScript sepa que trae negocio, plan, etc.)
async function cuenta(...a: Parameters<typeof obtener>): Promise<ConCuenta> {
  const r = await obtener(...a);
  assert.ok(r.usuario, "la cuenta debería existir");
  return r as ConCuenta;
}
const obtenerCuenta = obtener;

const guardado = process.env.STUDIO_ADMIN_EMAILS;
beforeEach(() => {
  delete process.env.STUDIO_ADMIN_EMAILS;
});
afterEach(() => {
  if (guardado === undefined) delete process.env.STUDIO_ADMIN_EMAILS;
  else process.env.STUDIO_ADMIN_EMAILS = guardado;
});

test("usuario nuevo: obtenerCuenta devuelve usuario null", async () => {
  const r = await obtenerCuenta("nuevo", "a@b.com", true, { store: memoryStore(), now: AHORA });
  assert.equal(r.usuario, null);
  assert.equal(r.esAdmin, false);
});

test("usuario nuevo crea negocio en prueba con pruebaHasta = ahora + 600000", async () => {
  const store = memoryStore();
  const r = await crearCuenta("u9", "Nuevo@X.com", true, "  Mi Negocio  ", { store, now: AHORA });
  assert.equal(r.ok, true);
  const n = await store.getNegocio((await store.getUsuario("u9"))!.negocioId);
  assert.equal(n?.nombre, "Mi Negocio");
  assert.equal(n?.estado, "prueba");
  assert.equal(n?.plan, "pro");
  assert.equal(n?.origen, null);
  assert.equal(n?.pruebaHasta, AHORA + 600000);
  assert.deepEqual(n?.miembros, ["u9"]);
  assert.equal((await store.getUsuario("u9"))?.rol, "dueno");
  assert.equal((await store.getUsuario("u9"))?.email, "nuevo@x.com");
});

test("segunda llamada no crea otro negocio", async () => {
  const store = memoryStore();
  const a = await crearCuenta("u9", "a@x.com", true, "Uno", { store, now: AHORA });
  const b = await crearCuenta("u9", "a@x.com", true, "Dos", { store, now: AHORA });
  assert.ok(a.ok && b.ok);
  assert.equal(a.ok && b.ok && a.usuario.negocioId, b.ok && b.usuario.negocioId);
});

test("llamadas simultáneas crean un solo negocio", async () => {
  const store = memoryStore();
  const rs = await Promise.all([1, 2, 3].map(() => crearCuenta("u9", "a@x.com", true, "Uno", { store, now: AHORA })));
  const ids = new Set(rs.map((r) => (r.ok ? r.usuario.negocioId : "")));
  assert.equal(ids.size, 1);
});

test("nombre inválido", async () => {
  for (const nombre of ["", "   ", "x".repeat(81)]) {
    const r = await crearCuenta("u9", "a@x.com", true, nombre, { store: memoryStore(), now: AHORA });
    assert.deepEqual(r, { ok: false, status: 400, error: "Escribe el nombre de tu negocio (máximo 80 caracteres)." });
  }
});

test("invitación Ana@Gmail.com y registro como ana@gmail.com se une como miembro", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  const inv = await invitar("u1", "Ana@Gmail.com", { store, now: AHORA });
  assert.equal(inv.ok, true);
  const r = await crearCuenta("u2", "ana@gmail.com", true, "", { store, now: AHORA });
  assert.ok(r.ok);
  const u = await store.getUsuario("u2");
  assert.equal(u?.rol, "miembro");
  assert.equal(u?.negocioId, "n1");
  assert.deepEqual((await store.getNegocio("n1"))?.miembros, ["u1", "u2"]);
  assert.equal(await store.getInvitacion("ana@gmail.com"), null);
});

test("invitación con negocio lleno: no se une y crea el suyo", async () => {
  const store = memoryStore({
    usuarios: [dueno, miembro("u2"), miembro("u3")],
    negocios: [negocio({ miembros: ["u1", "u2", "u3"] })],
  });
  await store.crearInvitacion("ana@gmail.com", { negocioId: "n1", invitadoPor: "u1", creado: AHORA });
  const r = await crearCuenta("u4", "ana@gmail.com", true, "Mío", { store, now: AHORA });
  assert.ok(r.ok);
  assert.notEqual((await store.getUsuario("u4"))?.negocioId, "n1");
  assert.equal((await store.getNegocio("n1"))?.miembros.length, 3);
});

test("con 3 personas no se puede invitar a una cuarta", async () => {
  const store = memoryStore({
    usuarios: [dueno, miembro("u2"), miembro("u3")],
    negocios: [negocio({ miembros: ["u1", "u2", "u3"] })],
  });
  const r = await invitar("u1", "otra@x.com", { store, now: AHORA });
  assert.deepEqual(r, { ok: false, status: 400, error: "Tu plan permite hasta 3 personas." });
});

test("las invitaciones pendientes cuentan para el cupo", async () => {
  const store = memoryStore({ usuarios: [dueno, miembro("u2")], negocios: [negocio({ miembros: ["u1", "u2"] })] });
  assert.ok((await invitar("u1", "a@x.com", { store, now: AHORA })).ok);
  const r = await invitar("u1", "b@x.com", { store, now: AHORA });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 400);
});

test("básico no puede invitar", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio({ plan: "basico" })] });
  const r = await invitar("u1", "a@x.com", { store, now: AHORA });
  assert.deepEqual(r, { ok: false, status: 403, error: "Invitar a tu equipo es del plan Pro." });
});

test("un miembro no puede invitar", async () => {
  const store = memoryStore({ usuarios: [dueno, miembro("u2")], negocios: [negocio({ miembros: ["u1", "u2"] })] });
  const r = await invitar("u2", "a@x.com", { store, now: AHORA });
  assert.deepEqual(r, { ok: false, status: 403, error: "Solo el dueño del negocio puede invitar." });
});

test("correo inválido y duplicado", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  const mal = await invitar("u1", "no-es-correo", { store, now: AHORA });
  assert.deepEqual(mal, { ok: false, status: 400, error: "Escribe un correo válido." });
  assert.ok((await invitar("u1", "a@x.com", { store, now: AHORA })).ok);
  const dup = await invitar("u1", "A@x.com", { store, now: AHORA });
  assert.deepEqual(dup, { ok: false, status: 400, error: "Esa persona ya está en tu equipo o ya tiene una invitación." });
  const yo = await invitar("u1", "DUENO@ejemplo.com", { store, now: AHORA });
  assert.equal(yo.ok, false);
});

test("quitarMiembro: dueño quita a otro; no a sí mismo; miembro no puede", async () => {
  const store = memoryStore({ usuarios: [dueno, miembro("u2")], negocios: [negocio({ miembros: ["u1", "u2"] })] });
  assert.deepEqual(await quitarMiembro("u2", "u1", { store, now: AHORA }), {
    ok: false, status: 403, error: "Solo el dueño del negocio puede quitar personas.",
  });
  assert.deepEqual(await quitarMiembro("u1", "u1", { store, now: AHORA }), {
    ok: false, status: 400, error: "No puedes quitarte a ti mismo.",
  });
  assert.ok((await quitarMiembro("u1", "u2", { store, now: AHORA })).ok);
  assert.deepEqual((await store.getNegocio("n1"))?.miembros, ["u1"]);
  assert.equal(await store.getUsuario("u2"), null);
});

test("quitarMiembro no toca a alguien de otro negocio", async () => {
  const otro: Usuario = { uid: "z", email: "z@x.com", negocioId: "n2", rol: "dueno", creado: AHORA };
  const store = memoryStore({ usuarios: [dueno, otro], negocios: [negocio(), negocio({ id: "n2", duenoUid: "z", miembros: ["z"] })] });
  const r = await quitarMiembro("u1", "z", { store, now: AHORA });
  assert.equal(r.ok, false);
  assert.ok(await store.getUsuario("z"));
});

test("admin sin importar mayúsculas", async () => {
  process.env.STUDIO_ADMIN_EMAILS = "Hector@X.com, otro@y.com";
  const r = await obtenerCuenta("nuevo", "hector@x.com", true, { store: memoryStore(), now: AHORA });
  assert.equal(r.esAdmin, true);
  const sinConfirmar = await obtenerCuenta("nuevo", "hector@x.com", false, { store: memoryStore(), now: AHORA });
  assert.equal(sinConfirmar.esAdmin, false);
  const r2 = await obtenerCuenta("nuevo", "nadie@x.com", true, { store: memoryStore(), now: AHORA });
  assert.equal(r2.esAdmin, false);
});

test("obtenerCuenta del dueño: plan, herramientas, límites, uso y equipo", async () => {
  const store = memoryStore({
    usuarios: [dueno, miembro("u2")],
    negocios: [negocio({ miembros: ["u1", "u2"] })],
    uso: { [`n1_${diaChicago(AHORA)}`]: { textos: 5 } },
  });
  await invitar("u1", "a@x.com", { store, now: AHORA });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.ok(r.usuario);
  assert.equal(r.efectivo?.plan, "pro");
  assert.equal(r.uso?.textos, 5);
  assert.equal(r.limites?.textos, 200);
  assert.ok(r.herramientas?.includes("video_ia"));
  assert.deepEqual(r.precios, { basico: 19, pro: 39 });
  assert.equal(r.esDueno, true);
  // Sin pedirlo, no se leen las invitaciones (cuida las lecturas de Firestore)
  assert.deepEqual(r.equipo, { miembros: 2 });
  const conEquipo = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA }, { equipo: true });
  assert.deepEqual(conEquipo.equipo, { miembros: 2, invitaciones: ["a@x.com"] });
  const m = await cuenta("u2", "u2@x.com", true, { store, now: AHORA }, { equipo: true });
  assert.equal(m.esDueno, false);
  assert.equal(m.equipo, undefined);
});

test("obtenerCuenta con prueba vencida: sin herramientas y límites en cero", async () => {
  const store = memoryStore({
    usuarios: [dueno],
    negocios: [negocio({ estado: "prueba", origen: null, pruebaHasta: AHORA - 1 })],
  });
  const r = await cuenta("u1", "d@x.com", true, { store, now: AHORA });
  assert.equal(r.efectivo?.estado, "sin_plan");
  assert.deepEqual(r.herramientas, []);
  assert.deepEqual(r.limites, { textos: 0, imagenes: 0, voces: 0, subtitulos: 0 });
});

test("invitado sin correo confirmado: rechazado con VERIFICAR_CORREO y no se crea nada", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  await invitar("u1", "ana@gmail.com", { store, now: AHORA });
  const r = await crearCuenta("u2", "ana@gmail.com", false, "Mío", { store, now: AHORA });
  assert.deepEqual(r, {
    ok: false,
    status: 403,
    error: "Confirma tu correo para unirte al equipo. Te enviamos un enlace a tu correo.",
    codigo: "VERIFICAR_CORREO",
  });
  assert.equal(await store.getUsuario("u2"), null);
  assert.equal(store.cantidadNegocios(), 1);
  assert.deepEqual((await store.getNegocio("n1"))?.miembros, ["u1"]);
  assert.ok(await store.getInvitacion("ana@gmail.com"));
});

test("sin invitación, un correo sin confirmar sí puede crear su negocio", async () => {
  const store = memoryStore();
  assert.ok((await crearCuenta("u9", "a@x.com", false, "Mío", { store, now: AHORA })).ok);
});

test("cancelarInvitacion: dueño libera el lugar; miembro no; otra invitación ajena da 404", async () => {
  const store = memoryStore({
    usuarios: [dueno, miembro("u2")],
    negocios: [negocio({ miembros: ["u1", "u2"] }), negocio({ id: "n2", duenoUid: "z", miembros: ["z"] })],
  });
  await invitar("u1", "a@x.com", { store, now: AHORA });
  await store.crearInvitacion("otra@x.com", { negocioId: "n2", invitadoPor: "z", creado: AHORA });
  assert.deepEqual(await cancelarInvitacion("u2", "a@x.com", { store }), {
    ok: false, status: 403, error: "Solo el dueño del negocio puede cancelar invitaciones.",
  });
  assert.deepEqual(await cancelarInvitacion("u1", "otra@x.com", { store }), {
    ok: false, status: 404, error: "No encontramos esa invitación.",
  });
  assert.ok(await store.getInvitacion("otra@x.com"));
  assert.deepEqual(await cancelarInvitacion("u1", "A@X.com", { store }), { ok: true });
  assert.equal(await store.getInvitacion("a@x.com"), null);
  assert.ok((await invitar("u1", "b@x.com", { store, now: AHORA })).ok); // el lugar quedó libre
});

test("invitar a alguien que ya tiene su propia cuenta", async () => {
  const otro: Usuario = { uid: "z", email: "z@x.com", negocioId: "n2", rol: "dueno", creado: AHORA };
  const store = memoryStore({ usuarios: [dueno, otro], negocios: [negocio(), negocio({ id: "n2", duenoUid: "z", miembros: ["z"] })] });
  const r = await invitar("u1", "Z@x.com", { store, now: AHORA });
  assert.deepEqual(r, { ok: false, status: 400, error: "Esa persona ya tiene su propia cuenta en Studio." });
});

test("dos crearCuenta a la vez del mismo uid dejan un solo negocio", async () => {
  const store = memoryStore();
  await Promise.all([1, 2].map(() => crearCuenta("u9", "a@x.com", true, "Uno", { store, now: AHORA })));
  assert.equal(store.cantidadNegocios(), 1);
  assert.equal((await store.getUsuario("u9"))?.negocioId, "n_u9");
});

test("quitarMiembro del store no borra al usuario que pertenece a otro negocio", async () => {
  const otro: Usuario = { uid: "z", email: "z@x.com", negocioId: "n2", rol: "dueno", creado: AHORA };
  const store = memoryStore({
    usuarios: [dueno, otro],
    negocios: [negocio({ miembros: ["u1", "z"] }), negocio({ id: "n2", duenoUid: "z", miembros: ["z"] })],
  });
  const r = await quitarMiembro("u1", "z", { store, now: AHORA });
  assert.ok(r.ok);
  assert.deepEqual((await store.getNegocio("n1"))?.miembros, ["u1"]);
  assert.ok(await store.getUsuario("z"));
});

test("si pierde la carrera al unirse, deshace el lugar tomado sin tocar su usuario", async () => {
  const otro: Usuario = { uid: "u2", email: "ana@gmail.com", negocioId: "n2", rol: "dueno", creado: AHORA };
  const base = memoryStore({
    usuarios: [dueno],
    negocios: [negocio(), negocio({ id: "n2", duenoUid: "u2", miembros: ["u2"] })],
  });
  await base.crearInvitacion("ana@gmail.com", { negocioId: "n1", invitadoPor: "u1", creado: AHORA });
  // Simula que otra petición crea su usuario justo antes
  const store = {
    ...base,
    async getUsuario(uid: string) {
      return calls++ === 0 ? null : base.getUsuario(uid);
    },
    async crearUsuario() {
      await base.crearUsuario(otro);
      return false;
    },
  };
  let calls = 0;
  const r = await crearCuenta("u2", "ana@gmail.com", true, "x", { store, now: AHORA });
  assert.ok(r.ok);
  assert.deepEqual((await base.getNegocio("n1"))?.miembros, ["u1"]);
  assert.equal((await base.getUsuario("u2"))?.negocioId, "n2");
});

/* ---------- Modo de Stripe (C1) ---------- */

test("obtenerCuenta: suscripción del otro modo de Stripe queda sin plan", async () => {
  const store = memoryStore({
    usuarios: [dueno],
    negocios: [negocio({ origen: "stripe", pagadoHasta: undefined, stripe: { status: "active", livemode: false } })],
  });
  const real = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA, stripeLive: true });
  assert.deepEqual(real.efectivo, { estado: "sin_plan", plan: null });
  assert.deepEqual(real.herramientas, []);
  const prueba = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA, stripeLive: false });
  assert.deepEqual(prueba.efectivo, { estado: "activo", plan: "pro" });
});

test("obtenerCuenta sin equipo=1 no consulta las invitaciones", async () => {
  const base = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  let consultas = 0;
  const store = { ...base, listarInvitaciones: async (id: string) => (consultas++, base.listarInvitaciones(id)) };
  await obtenerCuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.equal(consultas, 0);
  await obtenerCuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA }, { equipo: true });
  assert.equal(consultas, 1);
});

/* ---------- Unirse a un equipo solo si el negocio es Pro (I3) ---------- */

test("invitación de un negocio que bajó a Básico: no se une y crea el suyo", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio({ plan: "basico" })] });
  await store.crearInvitacion("ana@gmail.com", { negocioId: "n1", invitadoPor: "u1", creado: AHORA });
  const r = await crearCuenta("u2", "ana@gmail.com", true, "Lo mío", { store, now: AHORA });
  assert.ok(r.ok);
  const u = await store.getUsuario("u2");
  assert.equal(u?.rol, "dueno");
  assert.notEqual(u?.negocioId, "n1");
  assert.deepEqual((await store.getNegocio("n1"))?.miembros, ["u1"]);
});

test("invitación de un negocio en prueba no cuenta como Pro: no se une", async () => {
  const store = memoryStore({
    usuarios: [dueno],
    negocios: [negocio({ estado: "prueba", origen: null, pagadoHasta: undefined, pruebaHasta: AHORA + 5 * MIN })],
  });
  await store.crearInvitacion("ana@gmail.com", { negocioId: "n1", invitadoPor: "u1", creado: AHORA });
  const r = await crearCuenta("u2", "ana@gmail.com", true, "Lo mío", { store, now: AHORA });
  assert.ok(r.ok);
  assert.notEqual((await store.getUsuario("u2"))?.negocioId, "n1");
});
