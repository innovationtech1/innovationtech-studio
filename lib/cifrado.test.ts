import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cifrarClave, descifrarClave, llaveDeEntorno, type ClaveIA } from "./cifrado";
import { memoryStore } from "./account-store-memory";

const antes = process.env.STUDIO_CLAVES_SECRETO;
afterEach(() => {
  if (antes === undefined) delete process.env.STUDIO_CLAVES_SECRETO;
  else process.env.STUDIO_CLAVES_SECRETO = antes;
});

// Datos falsos y aleatorios: nunca un secreto real
const clave = (): ClaveIA => ({ accountId: randomBytes(16).toString("hex"), token: randomBytes(24).toString("base64") });

test("cifrado: ida y vuelta devuelve lo mismo", () => {
  const llave = randomBytes(32);
  const c = clave();
  const x = cifrarClave(c, llave);
  assert.equal(x.version, 1);
  assert.deepEqual(descifrarClave(x, llave), c);
});

test("cifrado: el documento no contiene el token ni el Account ID en claro", () => {
  const llave = randomBytes(32);
  const c = clave();
  const texto = JSON.stringify(cifrarClave(c, llave));
  assert.ok(!texto.includes(c.token));
  assert.ok(!texto.includes(c.accountId));
});

test("cifrado: dos cifrados del mismo dato tienen iv distinto", () => {
  const llave = randomBytes(32);
  const c = clave();
  const a = cifrarClave(c, llave);
  const b = cifrarClave(c, llave);
  assert.notEqual(a.iv, b.iv);
  assert.equal(Buffer.from(a.iv, "base64").length, 12);
});

test("cifrado: datos alterados → null", () => {
  const llave = randomBytes(32);
  const x = cifrarClave(clave(), llave);
  const bytes = Buffer.from(x.datos, "base64");
  bytes[0] ^= 1;
  assert.equal(descifrarClave({ ...x, datos: bytes.toString("base64") }, llave), null);
});

test("cifrado: otra llave → null", () => {
  const x = cifrarClave(clave(), randomBytes(32));
  assert.equal(descifrarClave(x, randomBytes(32)), null);
});

test("cifrado: documento mal formado → null (no lanza)", () => {
  const llave = randomBytes(32);
  const x = cifrarClave(clave(), llave);
  assert.equal(descifrarClave({ ...x, iv: "" }, llave), null);
  assert.equal(descifrarClave({ ...x, tag: "xx" }, llave), null);
  assert.equal(descifrarClave({ ...x, version: 2 as unknown as 1 }, llave), null);
  assert.equal(descifrarClave(null as unknown as typeof x, llave), null);
});

test("llaveDeEntorno: 32 bytes en base64 → Buffer", () => {
  const llave = randomBytes(32);
  process.env.STUDIO_CLAVES_SECRETO = llave.toString("base64");
  assert.ok(llaveDeEntorno()?.equals(llave));
});

test("llaveDeEntorno: falta → null; 31 bytes → null con console.error una sola vez", () => {
  delete process.env.STUDIO_CLAVES_SECRETO;
  assert.equal(llaveDeEntorno(), null);
  process.env.STUDIO_CLAVES_SECRETO = randomBytes(31).toString("base64");
  const original = console.error;
  const llamadas: unknown[][] = [];
  console.error = (...a: unknown[]) => void llamadas.push(a);
  try {
    assert.equal(llaveDeEntorno(), null);
    assert.equal(llaveDeEntorno(), null);
  } finally {
    console.error = original;
  }
  assert.ok(llamadas.length <= 1);
  assert.ok(!JSON.stringify(llamadas).includes(process.env.STUDIO_CLAVES_SECRETO));
});

test("store en memoria: guarda, lee y borra la clave cifrada", async () => {
  const s = memoryStore();
  const x = cifrarClave(clave(), randomBytes(32));
  assert.equal(await s.leerClaveIA("n1"), null);
  await s.guardarClaveIA("n1", x);
  assert.deepEqual(await s.leerClaveIA("n1"), x);
  assert.equal(await s.leerClaveIA("n2"), null);
  await s.borrarClaveIA("n1");
  assert.equal(await s.leerClaveIA("n1"), null);
});
