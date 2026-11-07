import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifyIdToken } from "./verify-token";

const PROYECTO = "proyecto-prueba";
const KID = "llave-1";
const AHORA = 1_800_000_000_000; // milisegundos fijos para que las pruebas no dependan del reloj

function par() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { privateKey, pem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}
const buena = par();
const otra = par();
const getCerts = async () => ({ [KID]: buena.pem });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function firmar(
  payload: Record<string, unknown>,
  opts: { key?: ReturnType<typeof par>; header?: Record<string, unknown> } = {},
) {
  const header = opts.header ?? { alg: "RS256", kid: KID, typ: "JWT" };
  const base = `${b64(header)}.${b64(payload)}`;
  const firma = createSign("RSA-SHA256").update(base).sign((opts.key ?? buena).privateKey);
  return `${base}.${firma.toString("base64url")}`;
}

const seg = AHORA / 1000;
function carga(extra: Record<string, unknown> = {}) {
  return {
    sub: "u1",
    email: "Ana@Gmail.com",
    email_verified: true,
    aud: PROYECTO,
    iss: `https://securetoken.google.com/${PROYECTO}`,
    iat: seg - 10,
    auth_time: seg - 10,
    exp: seg + 3600,
    ...extra,
  };
}
const opts = { projectId: PROYECTO, getCerts, now: AHORA };

test("token válido devuelve uid, email en minúsculas y emailVerified", async () => {
  const r = await verifyIdToken(firmar(carga()), opts);
  assert.deepEqual(r, { uid: "u1", email: "ana@gmail.com", emailVerified: true });
});

test("sin email devuelve cadena vacía y emailVerified false", async () => {
  const p = carga();
  delete (p as Record<string, unknown>).email;
  delete (p as Record<string, unknown>).email_verified;
  const r = await verifyIdToken(firmar(p), opts);
  assert.deepEqual(r, { uid: "u1", email: "", emailVerified: false });
});

test("audiencia de otro proyecto se rechaza", async () => {
  await assert.rejects(verifyIdToken(firmar(carga({ aud: "otro" })), opts));
});

test("emisor de otro proyecto se rechaza", async () => {
  await assert.rejects(verifyIdToken(firmar(carga({ iss: "https://securetoken.google.com/otro" })), opts));
});

test("token vencido se rechaza", async () => {
  await assert.rejects(verifyIdToken(firmar(carga({ exp: seg - 120 })), opts));
});

test("firmado con otra llave se rechaza", async () => {
  await assert.rejects(verifyIdToken(firmar(carga(), { key: otra }), opts));
});

test("algoritmo none o HS256 se rechaza", async () => {
  for (const alg of ["none", "HS256"]) {
    await assert.rejects(
      verifyIdToken(firmar(carga(), { header: { alg, kid: KID } }), opts),
      /Algoritmo/,
    );
  }
});

test("kid desconocido se rechaza", async () => {
  await assert.rejects(verifyIdToken(firmar(carga(), { header: { alg: "RS256", kid: "x" } }), opts));
});

test("sin sub se rechaza", async () => {
  const p = carga();
  delete (p as Record<string, unknown>).sub;
  await assert.rejects(verifyIdToken(firmar(p), opts));
});

test("formato inválido se rechaza", async () => {
  await assert.rejects(verifyIdToken("abc.def", opts));
});

test("iat o auth_time en el futuro se rechaza", async () => {
  await assert.rejects(verifyIdToken(firmar(carga({ iat: seg + 600 })), opts));
  await assert.rejects(verifyIdToken(firmar(carga({ auth_time: seg + 600 })), opts));
});
