import { test } from "node:test";
import assert from "node:assert/strict";
import { probarCloudflare } from "./probar-cloudflare";

// Datos falsos: nunca un secreto real
const ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "token-falso-de-prueba";

type Resp = { status: number; body: unknown };
// fetch falso: responde según la dirección pedida
function falso(rutas: (url: string) => Resp) {
  const pedidos: string[] = [];
  const f = (async (u: string | URL | Request) => {
    const url = String(u);
    pedidos.push(url);
    const r = rutas(url);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, pedidos };
}

const activo = { status: 200, body: { success: true, result: { status: "active" } } };

test("probarCloudflare: todo bien → ok con 3 revisiones en verde", async () => {
  const { f } = falso((u) => (u.includes("/ai/run/") ? { status: 200, body: { success: true, result: {} } } : activo));
  const r = await probarCloudflare(ID, TOKEN, f);
  assert.equal(r.ok, true);
  assert.deepEqual(r.checks.map((c) => c.ok), [true, true, true]);
  assert.equal(r.checks[2].label, "Permiso para usar la IA de Cloudflare (Workers AI)");
});

test("probarCloudflare: Account ID con mal formato y token vacío", async () => {
  const { f, pedidos } = falso(() => activo);
  const r = await probarCloudflare("abc", "", f);
  assert.equal(r.ok, false);
  assert.equal(r.checks[0].label, "Account ID con el formato correcto");
  assert.equal(r.checks[0].ok, false);
  assert.equal(r.checks[1].label, "Token");
  assert.equal(pedidos.length, 0);
});

test("probarCloudflare: sin permiso de Workers AI → mensaje de permiso", async () => {
  const { f } = falso((u) => (u.includes("/ai/run/") ? { status: 403, body: { success: false, errors: [{ message: "Authentication error" }] } } : activo));
  const r = await probarCloudflare(ID, TOKEN, f);
  assert.equal(r.ok, false);
  assert.match(r.checks[2].help ?? "", /no tiene permiso de Workers AI/);
});

test("probarCloudflare: token inactivo → «Token válido y activo» en rojo", async () => {
  const { f } = falso(() => ({ status: 401, body: { success: false } }));
  const r = await probarCloudflare(ID, TOKEN, f);
  assert.equal(r.ok, false);
  assert.equal(r.checks[1].ok, false);
  assert.equal(r.checks[2].help, "Primero corrige lo anterior.");
});
