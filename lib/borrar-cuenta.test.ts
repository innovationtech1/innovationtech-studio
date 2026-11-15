import { test } from "node:test";
import assert from "node:assert/strict";
import { borrarCuenta, huellaCorreo, PALABRA_BORRAR, type DepsBorrar } from "./borrar-cuenta";
import { crearCuenta } from "./account-api";
import type { Usuario } from "./account-store";
import { memoryStore } from "./account-store-memory";
import { memoryVideoStore } from "./video-store-memory";
import type { TrabajoVideo } from "./video-store";
import { mesChicago, type Negocio } from "./plans";

const AHORA = Date.parse("2026-11-14T18:00:00Z");
const MES = mesChicago(AHORA);
const SECRETO = "secreto-de-prueba";

function negocio(extra: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1",
    nombre: "Tortas",
    duenoUid: "u1",
    miembros: ["u1", "u2"],
    plan: "pro",
    estado: "activo",
    origen: "stripe",
    stripe: { customerId: "cus_1", subscriptionId: "sub_1", status: "active" },
    creado: AHORA - 1000,
    actualizado: AHORA - 1000,
    ...extra,
  };
}
const dueno: Usuario = { uid: "u1", email: "dueno@ejemplo.com", negocioId: "n1", rol: "dueno", creado: AHORA };
const miembro: Usuario = { uid: "u2", email: "ana@ejemplo.com", negocioId: "n1", rol: "miembro", creado: AHORA };
const trabajo = (id: string, negocioId: string): TrabajoVideo => ({
  id,
  negocioId,
  uid: "u1",
  plan: "pro",
  prioridad: 1,
  nivel: "estandar",
  modelo: "m",
  imagenKey: `negocios/${negocioId}/fotos/a.jpg`,
  movimiento: "zoom",
  estado: "listo",
  intentos: 0,
  clipKey: `negocios/${negocioId}/clips/${id}.mp4`,
  costoCentavos: 20,
  creado: AHORA,
  actualizado: AHORA,
  secreto: "s",
  reserva: { mes: MES, delMes: 1, delSaldo: 0 },
  cacheLlave: `k-${id}`,
});

async function mundo(o: { stripeFalla?: boolean; archivosFallan?: boolean; accesoFalla?: boolean } = {}) {
  const store = memoryStore({
    usuarios: [dueno, miembro, { uid: "u9", email: "otro@ejemplo.com", negocioId: "n9", rol: "dueno", creado: AHORA }],
    negocios: [negocio(), negocio({ id: "n9", duenoUid: "u9", miembros: ["u9"], stripe: undefined, origen: "manual" })],
    uso: { [`n1_${MES}`]: { textos: 3 }, [`n9_${MES}`]: { textos: 1 } },
    invitaciones: { "nuevo@ejemplo.com": { negocioId: "n1", invitadoPor: "u1", creado: AHORA } },
  });
  const videos = memoryVideoStore();
  await videos.crearTrabajos([trabajo("t1", "n1"), trabajo("t2", "n1"), trabajo("t9", "n9")]);
  await store.registrarPagoManual({ id: "p1", negocioId: "n1", plan: "pro", monto: 2900, metodo: "efectivo", hasta: AHORA, fecha: AHORA, registradoPor: "admin@ejemplo.com" });
  const hecho = { stripe: [] as string[], archivos: [] as string[], acceso: [] as string[] };
  const deps: DepsBorrar = {
    store,
    videos,
    now: AHORA,
    secreto: SECRETO,
    cancelarStripe: async (n) => {
      hecho.stripe.push(n.id);
      return o.stripeFalla ? { ok: false, status: 502, error: "Stripe no respondió." } : { ok: true };
    },
    borrarArchivos: async (prefijos) => {
      hecho.archivos.push(...prefijos);
      return o.archivosFallan ? prefijos : [];
    },
    borrarAcceso: async (uid) => {
      if (o.accesoFalla) throw new Error("Firebase caído");
      hecho.acceso.push(uid);
    },
  };
  return { store, videos, deps, hecho };
}
const S1 = { uid: "u1", email: "dueno@ejemplo.com", emailVerified: true };
const S2 = { uid: "u2", email: "ana@ejemplo.com", emailVerified: true };
const SI = { confirmacion: PALABRA_BORRAR };

test("sin escribir BORRAR no pasa nada", async () => {
  const m = await mundo();
  for (const cuerpo of [{}, null, { confirmacion: "borrar" }, { confirmacion: "si" }]) {
    const r = await borrarCuenta(S1, cuerpo, m.deps);
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.status, 400);
  }
  assert.ok(await m.store.getNegocio("n1"));
  assert.deepEqual(m.hecho, { stripe: [], archivos: [], acceso: [] });
});

test("el dueño borra: se cancela Stripe y desaparece el negocio con todo lo suyo", async () => {
  const m = await mundo();
  const r = await borrarCuenta(S1, SI, m.deps);
  assert.deepEqual(r, { ok: true, tipo: "dueno" });
  assert.deepEqual(m.hecho.stripe, ["n1"]);
  assert.equal(await m.store.getNegocio("n1"), null);
  assert.equal(await m.store.getUsuario("u1"), null);
  assert.equal(await m.store.getUsuario("u2"), null); // el equipo pierde el acceso
  assert.deepEqual(await m.store.listarInvitaciones("n1"), []);
  assert.equal((await m.store.getUso("n1", MES)).textos, 0);
  assert.deepEqual(m.videos.todos().map((t) => t.id), ["t9"]);
  assert.deepEqual(m.hecho.archivos.sort(), ["demo/negocios/n1/", "negocios/n1/"]);
});

test("solo se borra el inicio de sesión de quien lo pidió; al equipo no se le toca el suyo", async () => {
  const m = await mundo();
  await borrarCuenta(S1, SI, m.deps);
  assert.deepEqual(m.hecho.acceso, ["u1"]);
});

test("lo de otros negocios no se toca", async () => {
  const m = await mundo();
  await borrarCuenta(S1, SI, m.deps);
  assert.ok(await m.store.getNegocio("n9"));
  assert.ok(await m.store.getUsuario("u9"));
  assert.equal((await m.store.getUso("n9", MES)).textos, 1);
});

test("se conservan los pagos y queda una anotación sin nombre ni correo", async () => {
  const m = await mundo();
  await borrarCuenta(S1, SI, m.deps);
  assert.equal((await m.store.listarPagosManuales("n1")).length, 1);
  const [b] = await m.store.listarBorrados();
  assert.equal(b.negocioId, "n1");
  assert.equal(b.fecha, AHORA);
  assert.equal(b.customerId, "cus_1");
  assert.equal(b.personas, 2);
  assert.deepEqual(b.pendientes, []);
  const texto = JSON.stringify(b);
  assert.ok(!texto.includes("dueno@ejemplo.com") && !texto.includes("Tortas"));
});

test("si Stripe no deja cancelar, no se borra nada (nadie queda sin cuenta y con cobros)", async () => {
  const m = await mundo({ stripeFalla: true });
  const r = await borrarCuenta(S1, SI, m.deps);
  assert.ok(!r.ok);
  if (!r.ok) assert.equal(r.status, 502);
  assert.ok(await m.store.getNegocio("n1"));
  assert.ok(await m.store.getUsuario("u1"));
  assert.equal(m.videos.todos().length, 3);
  assert.deepEqual(m.hecho.acceso, []);
  assert.deepEqual(await m.store.listarBorrados(), []);
});

test("si los archivos del servidor no se pudieron borrar, la cuenta se borra igual y queda anotado para el administrador", async () => {
  const m = await mundo({ archivosFallan: true });
  const r = await borrarCuenta(S1, SI, m.deps);
  assert.ok(r.ok);
  const [b] = await m.store.listarBorrados();
  assert.deepEqual(b.pendientes.sort(), ["archivos: demo/negocios/n1/", "archivos: negocios/n1/"]);
});

test("si el inicio de sesión no se pudo borrar, la cuenta se borra igual y queda anotado", async () => {
  const m = await mundo({ accesoFalla: true });
  const r = await borrarCuenta(S1, SI, m.deps);
  assert.ok(r.ok);
  assert.equal(await m.store.getNegocio("n1"), null);
  assert.deepEqual((await m.store.listarBorrados())[0].pendientes, ["inicio de sesión"]);
});

test("un miembro borra su cuenta: sale del equipo y el negocio sigue igual", async () => {
  const m = await mundo();
  const r = await borrarCuenta(S2, SI, m.deps);
  assert.deepEqual(r, { ok: true, tipo: "miembro" });
  assert.equal(await m.store.getUsuario("u2"), null);
  const n = (await m.store.getNegocio("n1"))!;
  assert.deepEqual(n.miembros, ["u1"]);
  assert.equal(n.plan, "pro");
  assert.deepEqual(m.hecho.stripe, []);
  assert.deepEqual(m.hecho.archivos, []);
  assert.deepEqual(m.hecho.acceso, ["u2"]);
  assert.equal(m.videos.todos().length, 3);
});

test("la cuenta del administrador no se puede borrar", async () => {
  const antes = process.env.STUDIO_ADMIN_EMAILS;
  process.env.STUDIO_ADMIN_EMAILS = "dueno@ejemplo.com";
  try {
    const m = await mundo();
    const r = await borrarCuenta(S1, SI, m.deps);
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.status, 403);
    assert.ok(await m.store.getNegocio("n1"));
  } finally {
    if (antes === undefined) delete process.env.STUDIO_ADMIN_EMAILS;
    else process.env.STUDIO_ADMIN_EMAILS = antes;
  }
});

test("repetir el borrado (o alguien que aún no creó su negocio) solo quita el inicio de sesión", async () => {
  const m = await mundo();
  await borrarCuenta(S1, SI, m.deps);
  const r = await borrarCuenta(S1, SI, m.deps);
  assert.deepEqual(r, { ok: true, tipo: "sin_cuenta" });
  assert.deepEqual(m.hecho.stripe, ["n1"]); // no se volvió a llamar
  assert.equal((await m.store.listarBorrados()).length, 1);
});

test("huellaCorreo: no contiene el correo, es estable, ignora mayúsculas y cambia con el secreto", () => {
  const h = huellaCorreo("Dueno@Ejemplo.com ", SECRETO);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes("dueno"));
  assert.equal(h, huellaCorreo("dueno@ejemplo.com", SECRETO));
  assert.notEqual(h, huellaCorreo("dueno@ejemplo.com", "otro-secreto"));
  assert.notEqual(h, huellaCorreo("otra@ejemplo.com", SECRETO));
});

test("quien borró su cuenta y vuelve con el mismo correo ya no recibe prueba gratis; un correo nuevo sí", async () => {
  const m = await mundo();
  await borrarCuenta(S1, SI, m.deps);
  const otra = await crearCuenta("u1b", "dueno@ejemplo.com", true, "Tortas 2", true, { store: m.store, now: AHORA + 1000, secretoHuella: SECRETO });
  assert.ok(otra.ok);
  const n = (await m.store.getNegocio("n_u1b"))!;
  assert.ok((n.pruebaHasta ?? 0) <= AHORA + 1000, "sin prueba gratis otra vez");
  const nueva = await crearCuenta("u7", "nueva@ejemplo.com", true, "Nueva", true, { store: m.store, now: AHORA + 1000, secretoHuella: SECRETO });
  assert.ok(nueva.ok);
  assert.ok(((await m.store.getNegocio("n_u7"))!.pruebaHasta ?? 0) > AHORA + 1000);
});

test("un miembro que borra su cuenta no pierde su derecho a prueba (nunca tuvo una)", async () => {
  const m = await mundo();
  await borrarCuenta(S2, SI, m.deps);
  const r = await crearCuenta("u2b", "ana@ejemplo.com", true, "Ana", true, { store: m.store, now: AHORA + 1000, secretoHuella: SECRETO });
  assert.ok(r.ok);
  assert.ok(((await m.store.getNegocio("n_u2b"))!.pruebaHasta ?? 0) > AHORA + 1000);
});
