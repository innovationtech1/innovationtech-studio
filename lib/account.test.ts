import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cuentasActivas, jsonAcceso, requireAccess } from "./account";
import type { AccountStore, Usuario } from "./account-store";
import { memoryStore } from "./account-store-memory";
import { DEFAULT_CONFIG, diaChicago, type Negocio } from "./plans";

const AHORA = Date.parse("2026-11-07T18:00:00Z");
const DIA = diaChicago(AHORA);
const MIN = 60 * 1000;

function negocio(extra: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1",
    nombre: "Tortas de prueba",
    duenoUid: "u1",
    miembros: ["u1"],
    plan: "basico",
    estado: "activo",
    origen: "manual",
    pagadoHasta: AHORA + 30 * 24 * 60 * MIN,
    creado: AHORA - 60 * MIN,
    actualizado: AHORA - 60 * MIN,
    ...extra,
  };
}

const usuario: Usuario = {
  uid: "u1",
  email: "dueno@ejemplo.com",
  negocioId: "n1",
  rol: "dueno",
  creado: AHORA - 60 * MIN,
};

// Verificador falso: "token-bueno" es válido, cualquier otro falla
const verify = async (token: string) => {
  if (token !== "token-bueno") throw new Error("Token inválido");
  return { uid: "u1", email: "dueno@ejemplo.com", emailVerified: true };
};

function req(token: string | null = "token-bueno") {
  const headers: Record<string, string> = {};
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/prueba", { method: "POST", headers });
}

function tienda(n: Partial<Negocio> = {}, uso: Record<string, Partial<Record<string, number>>> = {}) {
  return memoryStore({ usuarios: [usuario], negocios: [negocio(n)], uso });
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

test("cuentasActivas lee STUDIO_CUENTAS", () => {
  assert.equal(cuentasActivas(), true);
  process.env.STUDIO_CUENTAS = "off";
  assert.equal(cuentasActivas(), false);
  delete process.env.STUDIO_CUENTAS;
  assert.equal(cuentasActivas(), false);
});

test("sin encabezado Authorization → 401 SESION", async () => {
  const a = await requireAccess(req(null), { herramienta: "textos", contador: "textos", clavePropia: false }, { store: tienda(), verify, now: AHORA });
  assert.equal(a.ok, false);
  if (a.ok) return;
  assert.equal(a.status, 401);
  assert.equal(a.codigo, "SESION");
  assert.equal(a.mensaje, "Inicia sesión para continuar.");
});

test("token inválido → 401 SESION", async () => {
  const a = await requireAccess(req("token-malo"), { herramienta: "textos", clavePropia: false }, { store: tienda(), verify, now: AHORA });
  assert.ok(!a.ok && a.status === 401 && a.codigo === "SESION");
});

test("encabezado sin 'Bearer' → 401 SESION", async () => {
  const r = new Request("http://localhost/api/prueba", { headers: { Authorization: "token-bueno" } });
  const a = await requireAccess(r, { herramienta: "textos", clavePropia: false }, { store: tienda(), verify, now: AHORA });
  assert.ok(!a.ok && a.codigo === "SESION");
});

test("usuario sin cuenta → 403 SIN_PLAN (crear negocio)", async () => {
  const store = memoryStore({ negocios: [negocio()] });
  const a = await requireAccess(req(), { herramienta: "textos", clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(!a.ok);
  if (a.ok) return;
  assert.equal(a.status, 403);
  assert.equal(a.codigo, "SIN_PLAN");
  assert.equal(a.mensaje, "Crea tu cuenta para empezar.");
});

test("negocio pausado → 403 PAUSADO", async () => {
  const a = await requireAccess(req(), { herramienta: "textos", contador: "textos", clavePropia: false }, { store: tienda({ estado: "pausado" }), verify, now: AHORA });
  assert.ok(!a.ok);
  if (a.ok) return;
  assert.equal(a.status, 403);
  assert.equal(a.codigo, "PAUSADO");
  assert.equal(a.mensaje, "Tu cuenta está en pausa. Paga para reactivarla.");
});

test("prueba vencida → 403 SIN_PLAN", async () => {
  const store = tienda({ estado: "prueba", plan: null, origen: null, pagadoHasta: undefined, pruebaHasta: AHORA - MIN });
  const a = await requireAccess(req(), { herramienta: "textos", contador: "textos", clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(!a.ok);
  if (a.ok) return;
  assert.equal(a.status, 403);
  assert.equal(a.codigo, "SIN_PLAN");
  assert.equal(a.mensaje, "Tu prueba terminó. Elige un plan para seguir creando.");
});

test("básico pide voz → 403 PLAN", async () => {
  const a = await requireAccess(req(), { herramienta: "voz", contador: "voces", clavePropia: false }, { store: tienda(), verify, now: AHORA });
  assert.ok(!a.ok);
  if (a.ok) return;
  assert.equal(a.status, 403);
  assert.equal(a.codigo, "PLAN");
  assert.equal(a.mensaje, "Esta herramienta es del plan Pro. Mejora a Pro para usarla.");
});

test("básico con 20 imágenes usadas pide 1 → 429 LIMITE", async () => {
  const store = tienda({}, { [`n1_${DIA}`]: { imagenes: 20 } });
  const a = await requireAccess(req(), { herramienta: "imagenes", contador: "imagenes", clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(!a.ok);
  if (a.ok) return;
  assert.equal(a.status, 429);
  assert.equal(a.codigo, "LIMITE");
  assert.equal(
    a.mensaje,
    "Llegaste al límite de hoy (20 imágenes). Se reinicia a medianoche. Puedes pasarte a Pro o conectar tu propia cuenta para usarlo sin límite.",
  );
  assert.equal(store.uso("n1", DIA).imagenes, 20);
});

test("LIMITE de textos usa la palabra 'mensajes y textos'", async () => {
  const store = tienda({}, { [`n1_${DIA}`]: { textos: 60 } });
  const a = await requireAccess(req(), { herramienta: "textos", contador: "textos", clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(!a.ok && a.mensaje.startsWith("Llegaste al límite de hoy (60 mensajes y textos)."));
});

test("LIMITE en prueba usa el mensaje de la prueba", async () => {
  const store = tienda(
    { estado: "prueba", plan: null, origen: null, pagadoHasta: undefined, pruebaHasta: AHORA + 5 * MIN },
    { [`n1_${DIA}`]: { imagenes: 3 } },
  );
  const a = await requireAccess(req(), { herramienta: "imagenes", contador: "imagenes", clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(!a.ok);
  if (a.ok) return;
  assert.equal(a.status, 429);
  assert.equal(a.codigo, "LIMITE");
  assert.equal(a.mensaje, "Llegaste al límite de la prueba. Elige un plan para seguir creando.");
});

test("éxito: reserva 1 uso y devuelve negocio y plan", async () => {
  const store = tienda({}, { [`n1_${DIA}`]: { imagenes: 5 } });
  const a = await requireAccess(req(), { herramienta: "imagenes", contador: "imagenes", clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(a.ok);
  if (!a.ok) return;
  assert.equal(a.uid, "u1");
  assert.equal(a.negocio?.id, "n1");
  assert.equal(a.plan, "basico");
  assert.equal(a.contado, true);
  assert.equal(store.uso("n1", DIA).imagenes, 6);
});

test("unidades > 1 se reservan juntas y respetan el tope", async () => {
  const store = tienda({}, { [`n1_${DIA}`]: { imagenes: 17 } });
  const o = { herramienta: "imagenes" as const, contador: "imagenes" as const, unidades: 4, clavePropia: false };
  const no = await requireAccess(req(), o, { store, verify, now: AHORA });
  assert.ok(!no.ok && no.codigo === "LIMITE");
  assert.equal(store.uso("n1", DIA).imagenes, 17);
  const si = await requireAccess(req(), { ...o, unidades: 3 }, { store, verify, now: AHORA });
  assert.ok(si.ok);
  assert.equal(store.uso("n1", DIA).imagenes, 20);
});

test("con clavePropia:true no cuenta (el contador sigue igual)", async () => {
  const store = tienda({}, { [`n1_${DIA}`]: { imagenes: 20 } });
  const a = await requireAccess(req(), { herramienta: "imagenes", contador: "imagenes", clavePropia: true }, { store, verify, now: AHORA });
  assert.ok(a.ok);
  if (!a.ok) return;
  assert.equal(a.contado, false);
  assert.equal(store.uso("n1", DIA).imagenes, 20);
  await a.devolver(); // no hace nada
  assert.equal(store.uso("n1", DIA).imagenes, 20);
});

test("video_ia en pro sin clave propia → 403 CLAVE_PROPIA", async () => {
  const a = await requireAccess(req(), { herramienta: "video_ia", clavePropia: false }, { store: tienda({ plan: "pro" }), verify, now: AHORA });
  assert.ok(!a.ok);
  if (a.ok) return;
  assert.equal(a.status, 403);
  assert.equal(a.codigo, "CLAVE_PROPIA");
  assert.equal(a.mensaje, "El video con IA necesita tu propia clave de Replicate.");
});

test("video_ia en pro con clave propia → ok", async () => {
  const a = await requireAccess(req(), { herramienta: "video_ia", clavePropia: true }, { store: tienda({ plan: "pro" }), verify, now: AHORA });
  assert.ok(a.ok && a.plan === "pro" && a.contado === false);
});

test("video_ia en básico con clave propia → 403 PLAN", async () => {
  const a = await requireAccess(req(), { herramienta: "video_ia", clavePropia: true }, { store: tienda(), verify, now: AHORA });
  assert.ok(!a.ok && a.codigo === "PLAN");
});

test("devolver() resta lo reservado, una sola vez", async () => {
  const store = tienda({}, { [`n1_${DIA}`]: { textos: 10 } });
  const a = await requireAccess(req(), { herramienta: "textos", contador: "textos", unidades: 2, clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(a.ok);
  if (!a.ok) return;
  assert.equal(store.uso("n1", DIA).textos, 12);
  await a.devolver();
  assert.equal(store.uso("n1", DIA).textos, 10);
  await a.devolver(); // la segunda vez no resta otra vez
  assert.equal(store.uso("n1", DIA).textos, 10);
});

test("devolverUso nunca deja un contador debajo de 0", async () => {
  const store = tienda();
  await store.devolverUso("n1", DIA, "voces", 5);
  assert.equal(store.uso("n1", DIA).voces, 0);
});

test("dos requireAccess en paralelo con 19 imágenes usadas → exactamente uno ok", async () => {
  const store = tienda({}, { [`n1_${DIA}`]: { imagenes: 19 } });
  const o = { herramienta: "imagenes" as const, contador: "imagenes" as const, clavePropia: false };
  const [a, b] = await Promise.all([
    requireAccess(req(), o, { store, verify, now: AHORA }),
    requireAccess(req(), o, { store, verify, now: AHORA }),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
  const malo = [a, b].find((x) => !x.ok);
  assert.ok(malo && !malo.ok && malo.codigo === "LIMITE");
  assert.equal(store.uso("n1", DIA).imagenes, 20);
});

test("reservarUso del store falso es atómico con muchas llamadas en paralelo", async () => {
  const store = tienda();
  const r = await Promise.all(Array.from({ length: 10 }, () => store.reservarUso("n1", DIA, "imagenes", 1, 3)));
  assert.equal(r.filter(Boolean).length, 3);
  assert.equal(store.uso("n1", DIA).imagenes, 3);
});

test("los contadores son por día (otro día empieza en 0)", async () => {
  const store = tienda({}, { [`n1_2026-11-06`]: { imagenes: 20 } });
  const a = await requireAccess(req(), { herramienta: "imagenes", contador: "imagenes", clavePropia: false }, { store, verify, now: AHORA });
  assert.ok(a.ok);
});

test("getConfig del store falso mezcla lo guardado sobre DEFAULT_CONFIG", async () => {
  const store = memoryStore({ config: { pruebaMinutos: 30 } });
  const cfg = await store.getConfig();
  assert.equal(cfg.pruebaMinutos, 30);
  assert.deepEqual(cfg.limites, DEFAULT_CONFIG.limites);
});

test("STUDIO_CUENTAS sin definir → ok sin tocar el store", async () => {
  delete process.env.STUDIO_CUENTAS;
  const prohibido = new Proxy({} as AccountStore, {
    get() {
      throw new Error("No debía tocar el store");
    },
  });
  const verifyProhibido = async () => {
    throw new Error("No debía verificar");
  };
  const a = await requireAccess(req(null), { herramienta: "video_ia", contador: "imagenes", clavePropia: false }, { store: prohibido, verify: verifyProhibido, now: AHORA });
  assert.ok(a.ok);
  if (!a.ok) return;
  assert.equal(a.contado, false);
  assert.equal(a.negocio, null);
  assert.equal(a.plan, null);
  await a.devolver();
});

test("jsonAcceso arma la respuesta de error con su status", async () => {
  const r = jsonAcceso({ ok: false, status: 429, codigo: "LIMITE", mensaje: "Hola" });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await r.json(), { error: "Hola", codigo: "LIMITE" });
});
