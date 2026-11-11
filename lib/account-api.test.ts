import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cancelarInvitacion, conectarClaveIA, crearCuenta, desconectarClaveIA, invitar, obtenerCuenta as obtener, quitarMiembro, type EstadoCuenta } from "./account-api";
import { randomBytes } from "node:crypto";
import { cifrarClave, descifrarClave } from "./cifrado";
import type { Check } from "./probar-cloudflare";
import type { Usuario } from "./account-store";
import { memoryStore } from "./account-store-memory";
import { VERSION_LEGAL } from "./legal";
import { mesChicago, type Negocio } from "./plans";

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
  const r = await crearCuenta("u9", "Nuevo@X.com", true, "  Mi Negocio  ", true, { store, now: AHORA });
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
  const a = await crearCuenta("u9", "a@x.com", true, "Uno", true, { store, now: AHORA });
  const b = await crearCuenta("u9", "a@x.com", true, "Dos", true, { store, now: AHORA });
  assert.ok(a.ok && b.ok);
  assert.equal(a.ok && b.ok && a.usuario.negocioId, b.ok && b.usuario.negocioId);
});

test("llamadas simultáneas crean un solo negocio", async () => {
  const store = memoryStore();
  const rs = await Promise.all([1, 2, 3].map(() => crearCuenta("u9", "a@x.com", true, "Uno", true, { store, now: AHORA })));
  const ids = new Set(rs.map((r) => (r.ok ? r.usuario.negocioId : "")));
  assert.equal(ids.size, 1);
});

test("nombre inválido", async () => {
  for (const nombre of ["", "   ", "x".repeat(81)]) {
    const r = await crearCuenta("u9", "a@x.com", true, nombre, true, { store: memoryStore(), now: AHORA });
    assert.deepEqual(r, { ok: false, status: 400, error: "Escribe el nombre de tu negocio (máximo 80 caracteres)." });
  }
});

test("invitación Ana@Gmail.com y registro como ana@gmail.com se une como miembro", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  const inv = await invitar("u1", "Ana@Gmail.com", { store, now: AHORA });
  assert.equal(inv.ok, true);
  const r = await crearCuenta("u2", "ana@gmail.com", true, "", true, { store, now: AHORA });
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
  const r = await crearCuenta("u4", "ana@gmail.com", true, "Mío", true, { store, now: AHORA });
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
    ok: false, status: 400, error: "No puedes quitarte a ti mismo del equipo.",
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
    uso: { [`n1_${mesChicago(AHORA)}`]: { textos: 5 } },
  });
  await invitar("u1", "a@x.com", { store, now: AHORA });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.ok(r.usuario);
  assert.equal(r.efectivo?.plan, "pro");
  assert.equal(r.uso?.textos, 5);
  assert.equal(r.limites?.textos, 3000);
  assert.ok(r.herramientas?.includes("video_ia"));
  assert.deepEqual(r.precios, { basico: 19, pro: 39 });
  assert.equal(r.esDueno, true);
  // Sin pedirlo, no se leen las invitaciones (cuida las lecturas de Firestore)
  assert.deepEqual(r.equipo, { miembros: 2 });
  const conEquipo = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA }, { equipo: true });
  assert.deepEqual(conEquipo.equipo, {
    miembros: 2,
    invitaciones: ["a@x.com"],
    personas: [
      { uid: "u1", email: "dueno@ejemplo.com", esDueno: true },
      { uid: "u2", email: "u2@x.com", esDueno: false },
    ],
  });
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
  assert.deepEqual(r.limites, { textos: 0, imagenes: 0, voces: 0, subtitulos: 0, tomas_ia: 0 });
});

test("invitado sin correo confirmado: rechazado con VERIFICAR_CORREO y no se crea nada", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  await invitar("u1", "ana@gmail.com", { store, now: AHORA });
  const r = await crearCuenta("u2", "ana@gmail.com", false, "Mío", true, { store, now: AHORA });
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

/* ---------- Correo confirmado antes de la prueba gratis ---------- */

test("sin invitación, un correo sin confirmar no crea negocio: VERIFICAR_CORREO", async () => {
  const store = memoryStore();
  const r = await crearCuenta("u9", "a@x.com", false, "Mío", true, { store, now: AHORA });
  assert.deepEqual(r, {
    ok: false,
    status: 403,
    error: "Confirma tu correo para empezar tu prueba gratis. Te enviamos un enlace a tu correo.",
    codigo: "VERIFICAR_CORREO",
  });
  assert.equal(await store.getUsuario("u9"), null);
  assert.equal(store.cantidadNegocios(), 0);
});

test("sin confirmar y con nombre inválido: primero se pide el nombre (400)", async () => {
  const r = await crearCuenta("u9", "a@x.com", false, "  ", true, { store: memoryStore(), now: AHORA });
  assert.deepEqual(r, { ok: false, status: 400, error: "Escribe el nombre de tu negocio (máximo 80 caracteres)." });
});

test("después de confirmar el correo, la prueba empieza desde esa llamada", async () => {
  const store = memoryStore();
  await crearCuenta("u9", "a@x.com", false, "Mío", true, { store, now: AHORA });
  const despues = AHORA + 7 * MIN;
  const r = await crearCuenta("u9", "a@x.com", true, "Mío", true, { store, now: despues });
  assert.ok(r.ok);
  const cfg = await store.getConfig();
  const n = await store.getNegocio((await store.getUsuario("u9"))!.negocioId);
  assert.equal(n?.estado, "prueba");
  assert.equal(n?.pruebaHasta, despues + cfg.pruebaMinutos * 60000);
});

test("quien ya tiene cuenta entra aunque su correo no esté confirmado", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  const r = await crearCuenta("u1", "dueno@ejemplo.com", false, "", true, { store, now: AHORA });
  assert.deepEqual(r, { ok: true, usuario: dueno });
});

/* ---------- Aceptar los Términos y la Política de privacidad ---------- */

const SIN_TERMINOS = {
  ok: false,
  status: 400,
  error: "Acepta los Términos de servicio y la Política de privacidad para continuar.",
  codigo: "ACEPTAR_TERMINOS",
};

test("negocio propio sin aceptar los términos: 400 ACEPTAR_TERMINOS y no se crea nada", async () => {
  const store = memoryStore();
  const r = await crearCuenta("u9", "a@x.com", true, "Mío", false, { store, now: AHORA });
  assert.deepEqual(r, SIN_TERMINOS);
  assert.equal(await store.getUsuario("u9"), null);
  assert.equal(store.cantidadNegocios(), 0);
});

test("negocio propio aceptando los términos: el usuario guarda la versión y la fecha", async () => {
  const store = memoryStore();
  const r = await crearCuenta("u9", "a@x.com", true, "Mío", true, { store, now: AHORA });
  assert.ok(r.ok);
  assert.deepEqual(r.usuario.terminos, { version: VERSION_LEGAL, fecha: AHORA });
  assert.deepEqual((await store.getUsuario("u9"))?.terminos, { version: VERSION_LEGAL, fecha: AHORA });
});

test("sin confirmar el correo se pide primero confirmarlo (antes que los términos)", async () => {
  const r = await crearCuenta("u9", "a@x.com", false, "Mío", false, { store: memoryStore(), now: AHORA });
  assert.equal(r.ok === false && r.codigo, "VERIFICAR_CORREO");
});

test("unirse por invitación sin aceptar los términos: 400 y no se une", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  await invitar("u1", "ana@gmail.com", { store, now: AHORA });
  const r = await crearCuenta("u2", "ana@gmail.com", true, "", false, { store, now: AHORA });
  assert.deepEqual(r, SIN_TERMINOS);
  assert.equal(await store.getUsuario("u2"), null);
  assert.deepEqual((await store.getNegocio("n1"))?.miembros, ["u1"]);
  assert.ok(await store.getInvitacion("ana@gmail.com"));
});

test("unirse por invitación aceptando los términos: el miembro guarda la versión y la fecha", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  await invitar("u1", "ana@gmail.com", { store, now: AHORA });
  const r = await crearCuenta("u2", "ana@gmail.com", true, "", true, { store, now: AHORA });
  assert.ok(r.ok);
  const u = await store.getUsuario("u2");
  assert.equal(u?.rol, "miembro");
  assert.deepEqual(u?.terminos, { version: VERSION_LEGAL, fecha: AHORA });
});

test("quien ya tiene cuenta no tiene que aceptar de nuevo (sin bloqueo)", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio()] });
  const r = await crearCuenta("u1", "dueno@ejemplo.com", true, "", false, { store, now: AHORA });
  assert.deepEqual(r, { ok: true, usuario: dueno });
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
  await Promise.all([1, 2].map(() => crearCuenta("u9", "a@x.com", true, "Uno", true, { store, now: AHORA })));
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
  const r = await crearCuenta("u2", "ana@gmail.com", true, "x", true, { store, now: AHORA });
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
  const r = await crearCuenta("u2", "ana@gmail.com", true, "Lo mío", true, { store, now: AHORA });
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
  const r = await crearCuenta("u2", "ana@gmail.com", true, "Lo mío", true, { store, now: AHORA });
  assert.ok(r.ok);
  assert.notEqual((await store.getUsuario("u2"))?.negocioId, "n1");
});

test("obtenerCuenta: límites del mes, reinicio, saldo y paquetes según el plan", async () => {
  const ocho = Date.parse("2026-11-08T18:00:00Z");
  const pro = memoryStore({ usuarios: [dueno], negocios: [negocio({ paquetes: { voces: 7 } })] });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store: pro, now: ocho });
  assert.equal(r.limites?.voces, 250);
  assert.equal(r.reinicio, Date.parse("2026-12-01T06:00:00Z"));
  assert.deepEqual(r.saldo, { voces: 7 });
  assert.deepEqual(r.paquetes?.map((p) => p.id), ["creativo", "voz", "video"]);
  assert.deepEqual(r.paquetes?.find((p) => p.id === "voz")?.contenido, { voces: 100, subtitulos: 100 });

  const basico = memoryStore({ usuarios: [dueno], negocios: [negocio({ plan: "basico" })] });
  const b = await cuenta("u1", "dueno@ejemplo.com", true, { store: basico, now: ocho });
  assert.deepEqual(b.paquetes?.map((p) => p.id), ["creativo", "video"]);
  assert.deepEqual(b.saldo, {});

  const sin = memoryStore({
    usuarios: [dueno],
    negocios: [negocio({ estado: "prueba", origen: null, pruebaHasta: ocho - 1 })],
  });
  const s = await cuenta("u1", "dueno@ejemplo.com", true, { store: sin, now: ocho });
  assert.deepEqual(s.paquetes, []);
});

test("obtenerCuenta: un negocio pausado no ofrece paquetes", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio({ estado: "pausado" })] });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.equal(r.efectivo?.estado, "pausado");
  assert.deepEqual(r.paquetes, []);
});

/* ---------- Pasar de pago a mano a tarjeta ---------- */

// Con los precios de Stripe preparados (sin ellos no se puede pagar con tarjeta)
const CON_PRECIOS = { precios: { basico: { monto: 19, stripePriceId: "price_b" }, pro: { monto: 39, stripePriceId: "price_p" } } };

test("obtenerCuenta: dueño con pago a mano vigente (≥ 48 h) puede pasar a tarjeta", async () => {
  const hasta = AHORA + 30 * 24 * 60 * MIN;
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio({ plan: "basico", pagadoHasta: hasta })], config: CON_PRECIOS });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.deepEqual(r.pasarATarjeta, { fecha: hasta, precio: 19 });
});

test("obtenerCuenta: sin el precio de Stripe del plan preparado → sin pasar a tarjeta", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio({ plan: "basico" })] });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.equal(r.pasarATarjeta, null);
  const soloPro = memoryStore({
    usuarios: [dueno],
    negocios: [negocio({ plan: "basico" })],
    config: { precios: { basico: { monto: 19 }, pro: { monto: 39, stripePriceId: "price_p" } } },
  });
  assert.equal((await cuenta("u1", "dueno@ejemplo.com", true, { store: soloPro, now: AHORA })).pasarATarjeta, null);
});

test("obtenerCuenta: un miembro no ve pasar a tarjeta", async () => {
  const store = memoryStore({
    usuarios: [dueno, miembro("u2")],
    negocios: [negocio({ plan: "basico", miembros: ["u1", "u2"] })],
    config: CON_PRECIOS,
  });
  const r = await cuenta("u2", "u2@x.com", true, { store, now: AHORA });
  assert.equal(r.pasarATarjeta, null);
});

test("obtenerCuenta: pago a mano que vence en menos de 48 h → sin pasar a tarjeta", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio({ plan: "basico", pagadoHasta: AHORA + 47 * 60 * MIN })], config: CON_PRECIOS });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.equal(r.pasarATarjeta, null);
});

test("obtenerCuenta: con tarjeta (Stripe) → sin pasar a tarjeta", async () => {
  const store = memoryStore({
    usuarios: [dueno],
    negocios: [negocio({ origen: "stripe", pagadoHasta: undefined, stripe: { status: "active" } })],
  });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.equal(r.pasarATarjeta, null);
});

/* ---------- Lista del equipo ---------- */

test("obtenerCuenta con equipo: personas con el dueño primero y el resto por correo", async () => {
  const store = memoryStore({
    usuarios: [
      dueno,
      { ...miembro("u2"), email: "zeta@x.com" },
      { ...miembro("u3"), email: "ana@x.com" },
    ],
    negocios: [negocio({ miembros: ["u2", "u1", "u3"] })],
  });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA }, { equipo: true });
  assert.deepEqual(r.equipo?.personas, [
    { uid: "u1", email: "dueno@ejemplo.com", esDueno: true },
    { uid: "u3", email: "ana@x.com", esDueno: false },
    { uid: "u2", email: "zeta@x.com", esDueno: false },
  ]);
});

test("obtenerCuenta con equipo: un miembro sin usuario sale con correo vacío", async () => {
  const store = memoryStore({ usuarios: [dueno], negocios: [negocio({ miembros: ["u1", "fantasma"] })] });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA }, { equipo: true });
  assert.deepEqual(r.equipo?.personas, [
    { uid: "u1", email: "dueno@ejemplo.com", esDueno: true },
    { uid: "fantasma", email: "", esDueno: false },
  ]);
});

test("obtenerCuenta sin equipo=1 no trae la lista de personas", async () => {
  const store = memoryStore({ usuarios: [dueno, miembro("u2")], negocios: [negocio({ miembros: ["u1", "u2"] })] });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA });
  assert.equal(r.equipo?.personas, undefined);
});

test("obtenerCuenta con equipo en Básico: el dueño igual ve personas e invitaciones que quedaron", async () => {
  const store = memoryStore({
    usuarios: [dueno, miembro("u2")],
    negocios: [negocio({ plan: "basico", miembros: ["u1", "u2"] })],
  });
  await store.crearInvitacion("a@x.com", { negocioId: "n1", invitadoPor: "u1", creado: AHORA });
  const r = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA }, { equipo: true });
  assert.equal(r.efectivo.plan, "basico");
  assert.deepEqual(r.equipo, {
    miembros: 2,
    invitaciones: ["a@x.com"],
    personas: [
      { uid: "u1", email: "dueno@ejemplo.com", esDueno: true },
      { uid: "u2", email: "u2@x.com", esDueno: false },
    ],
  });
});

// ---------- Clave de Cloudflare en la cuenta ----------
// Datos falsos y aleatorios: nunca un secreto real
const LLAVE = randomBytes(32);
const ID_CF = randomBytes(16).toString("hex");
const TOKEN_CF = `tok-${randomBytes(12).toString("hex")}`;
const VERDE: Check[] = [{ ok: true, label: "Todo bien" }];
const ROJO: Check[] = [{ ok: false, label: "Token válido y activo", help: "El token no es válido." }];
const probarOk = async () => ({ ok: true, checks: VERDE });
const probarMal = async () => ({ ok: false, checks: ROJO });
const conEquipo = () =>
  memoryStore({ usuarios: [dueno, miembro("u2")], negocios: [negocio({ miembros: ["u1", "u2"] })] });

test("conectarClaveIA: el dueño la conecta → iaPropia con los últimos 4 y documento cifrado legible", async () => {
  const store = conEquipo();
  let probada: [string, string] | null = null;
  const probar = async (a: string, t: string) => ((probada = [a, t]), { ok: true, checks: VERDE });
  const r = await conectarClaveIA("u1", { accountId: ` ${ID_CF} `, token: ` ${TOKEN_CF} ` }, { store, now: AHORA, llave: LLAVE, probar });
  assert.deepEqual(r, { ok: true, cuentaFin: ID_CF.slice(-4) });
  assert.deepEqual(probada, [ID_CF, TOKEN_CF]);
  const n = await store.getNegocio("n1");
  assert.deepEqual(n?.iaPropia, { cuentaFin: ID_CF.slice(-4), conectada: AHORA });
  const doc = await store.leerClaveIA("n1");
  assert.ok(doc);
  assert.deepEqual(descifrarClave(doc, LLAVE), { accountId: ID_CF, token: TOKEN_CF });
  assert.ok(!JSON.stringify(r).includes(TOKEN_CF));
});

test("conectarClaveIA: prueba fallida → 400 con checks y nada guardado", async () => {
  const store = conEquipo();
  const r = await conectarClaveIA("u1", { accountId: ID_CF, token: TOKEN_CF }, { store, now: AHORA, llave: LLAVE, probar: probarMal });
  assert.deepEqual(r, { ok: false, status: 400, error: "La clave no pasó la prueba.", checks: ROJO });
  assert.equal(await store.leerClaveIA("n1"), null);
  assert.equal((await store.getNegocio("n1"))?.iaPropia, undefined);
});

test("conectarClaveIA y desconectarClaveIA: un miembro → 403 y nada cambia", async () => {
  const store = conEquipo();
  await conectarClaveIA("u1", { accountId: ID_CF, token: TOKEN_CF }, { store, now: AHORA, llave: LLAVE, probar: probarOk });
  let probo = false;
  const c = await conectarClaveIA("u2", { accountId: ID_CF, token: TOKEN_CF }, {
    store, now: AHORA, llave: LLAVE, probar: async () => ((probo = true), { ok: true, checks: VERDE }),
  });
  assert.deepEqual(c, { ok: false, status: 403, error: "Solo el dueño del negocio puede conectar la cuenta de Cloudflare." });
  assert.equal(probo, false);
  const d = await desconectarClaveIA("u2", { store, now: AHORA });
  assert.deepEqual(d, { ok: false, status: 403, error: "Solo el dueño del negocio puede desconectar la cuenta de Cloudflare." });
  assert.ok(await store.leerClaveIA("n1"));
  assert.ok((await store.getNegocio("n1"))?.iaPropia);
});

test("conectarClaveIA: sin llave configurada → 503 con la copia exacta", async () => {
  const store = conEquipo();
  const r = await conectarClaveIA("u1", { accountId: ID_CF, token: TOKEN_CF }, { store, now: AHORA, llave: null, probar: probarOk });
  assert.deepEqual(r, { ok: false, status: 503, error: "Falta configurar el guardado seguro de claves. Avísale a InnovationTECH." });
  assert.equal(await store.leerClaveIA("n1"), null);
});

test("conectarClaveIA: datos que no son texto → 400 sin probar", async () => {
  const store = conEquipo();
  let probo = false;
  const probar = async () => ((probo = true), { ok: true, checks: VERDE });
  const r = await conectarClaveIA("u1", { accountId: 123, token: { x: 1 } }, { store, now: AHORA, llave: LLAVE, probar });
  assert.ok(!r.ok && r.status === 400);
  assert.equal(probo, false);
});

test("desconectarClaveIA: borra el documento cifrado y iaPropia; ok aunque no hubiera nada", async () => {
  const store = conEquipo();
  await conectarClaveIA("u1", { accountId: ID_CF, token: TOKEN_CF }, { store, now: AHORA, llave: LLAVE, probar: probarOk });
  assert.deepEqual(await desconectarClaveIA("u1", { store, now: AHORA }), { ok: true });
  assert.equal(await store.leerClaveIA("n1"), null);
  const n = await store.getNegocio("n1");
  assert.equal(n?.iaPropia, undefined);
  assert.ok(!("iaPropia" in (n ?? {})));
  assert.deepEqual(await desconectarClaveIA("u1", { store, now: AHORA }), { ok: true });
});

test("obtenerCuenta: iaPropia legible para dueño y miembro, sin el token ni el Account ID", async () => {
  const store = conEquipo();
  await conectarClaveIA("u1", { accountId: ID_CF, token: TOKEN_CF }, { store, now: AHORA, llave: LLAVE, probar: probarOk });
  for (const uid of ["u1", "u2"]) {
    const c = await cuenta(uid, `${uid}@x.com`, true, { store, now: AHORA, llave: LLAVE });
    assert.deepEqual(c.iaPropia, { cuentaFin: ID_CF.slice(-4), conectada: AHORA, legible: true });
    const texto = JSON.stringify(c);
    assert.ok(!texto.includes(TOKEN_CF), "el token no debe salir");
    assert.ok(!texto.includes(ID_CF), "el Account ID completo no debe salir");
  }
});

test("obtenerCuenta: legible false con llave distinta o sin llave; null sin clave conectada", async () => {
  const store = conEquipo();
  assert.equal((await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA, llave: LLAVE })).iaPropia, null);
  await store.guardarClaveIA("n1", cifrarClave({ accountId: ID_CF, token: TOKEN_CF }, LLAVE));
  await store.modificarNegocio("n1", () => ({ iaPropia: { cuentaFin: ID_CF.slice(-4), conectada: AHORA } }));
  const otra = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA, llave: randomBytes(32) });
  assert.equal(otra.iaPropia?.legible, false);
  const sin = await cuenta("u1", "dueno@ejemplo.com", true, { store, now: AHORA, llave: null });
  assert.equal(sin.iaPropia?.legible, false);
});
