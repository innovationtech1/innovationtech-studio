import { test } from "node:test";
import assert from "node:assert/strict";
import { configR2, firmarUrl, pedirSubida, prefirmar, subirDesdeUrl } from "./r2";
import type { Usuario } from "./account-store";
import { memoryStore } from "./account-store-memory";
import type { Negocio } from "./plans";

const AHORA = Date.parse("2026-11-10T18:00:00Z");
const MIN = 60 * 1000;
const CFG = { accountId: "cuenta123", accessKeyId: "AKIDEJEMPLO", secretAccessKey: "secreto-de-prueba", bucket: "studio-videos" };
const SHA = "a".repeat(64);

function negocio(extra: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1", nombre: "Tortas", duenoUid: "u1", miembros: ["u1"], plan: "pro", estado: "activo", origen: "manual",
    pagadoHasta: AHORA + 30 * 24 * 60 * MIN, creado: AHORA, actualizado: AHORA, ...extra,
  };
}
const dueno: Usuario = { uid: "u1", email: "d@x.com", negocioId: "n1", rol: "dueno", creado: AHORA };
const tienda = (n: Partial<Negocio> = {}) => memoryStore({ usuarios: [dueno], negocios: [negocio(n)] });

test("prefirmar: reproduce el ejemplo oficial de AWS (GET /test.txt, 24 h)", () => {
  const url = prefirmar({
    metodo: "GET",
    host: "examplebucket.s3.amazonaws.com",
    ruta: "/test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    segundos: 86400,
    ahora: new Date("2013-05-24T00:00:00Z"),
  });
  assert.equal(
    url,
    "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
      "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
      "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
      "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

test("firmarUrl: host de R2, región auto, bucket en la ruta y llave con caracteres especiales bien codificada", () => {
  const url = new URL(firmarUrl("GET", "negocios/n 1/fotos/año+1&x.jpg", 300, { cfg: CFG, ahora: new Date(AHORA) }));
  assert.equal(url.host, "cuenta123.r2.cloudflarestorage.com");
  assert.equal(url.pathname, "/studio-videos/negocios/n%201/fotos/a%C3%B1o%2B1%26x.jpg");
  assert.equal(url.searchParams.get("X-Amz-Credential"), "AKIDEJEMPLO/20261110/auto/s3/aws4_request");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
});

test("firmarUrl PUT: el tipo y el tamaño quedan firmados (no se puede subir otra cosa)", () => {
  const a = new URL(firmarUrl("PUT", "k.jpg", 300, { cfg: CFG, ahora: new Date(AHORA), tipo: "image/jpeg", bytes: 1000 }));
  const b = new URL(firmarUrl("PUT", "k.jpg", 300, { cfg: CFG, ahora: new Date(AHORA), tipo: "image/png", bytes: 1000 }));
  const c = new URL(firmarUrl("PUT", "k.jpg", 300, { cfg: CFG, ahora: new Date(AHORA), tipo: "image/jpeg", bytes: 2000 }));
  assert.equal(a.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host");
  assert.notEqual(a.searchParams.get("X-Amz-Signature"), b.searchParams.get("X-Amz-Signature"));
  assert.notEqual(a.searchParams.get("X-Amz-Signature"), c.searchParams.get("X-Amz-Signature"));
});

test("configR2: null si falta alguna variable", () => {
  assert.equal(configR2({}), null);
  assert.equal(configR2({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c" }), null);
  assert.deepEqual(configR2({ R2_ACCOUNT_ID: " a ", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d" }), {
    accountId: "a", accessKeyId: "b", secretAccessKey: "c", bucket: "d",
  });
});

test("pedirSubida: da el enlace y la llave de la foto del negocio", async () => {
  const r = await pedirSubida("u1", { tipo: "image/jpeg", bytes: 5000, sha256: SHA }, { store: tienda(), now: AHORA, cfg: CFG });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.imagenKey, `negocios/n1/fotos/${SHA}.jpg`);
  const url = new URL(r.url);
  assert.equal(url.pathname, `/studio-videos/negocios/n1/fotos/${SHA}.jpg`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
});

test("pedirSubida en la prueba gratis: la foto va bajo demo/ (se borra a los 30 días)", async () => {
  const store = tienda({ estado: "prueba", plan: null, origen: null, pagadoHasta: undefined, pruebaHasta: AHORA + MIN });
  const r = await pedirSubida("u1", { tipo: "image/png", bytes: 5000, sha256: SHA }, { store, now: AHORA, cfg: CFG });
  assert.ok(r.ok && r.imagenKey === `demo/negocios/n1/fotos/${SHA}.png`);
});

test("pedirSubida rechaza tipo, tamaño y sha256 inválidos", async () => {
  const deps = { store: tienda(), now: AHORA, cfg: CFG };
  for (const datos of [
    { tipo: "image/gif", bytes: 5000, sha256: SHA },
    { tipo: "image/jpeg", bytes: 8 * 1024 * 1024 + 1, sha256: SHA },
    { tipo: "image/jpeg", bytes: 0, sha256: SHA },
    { tipo: "image/jpeg", bytes: "5000", sha256: SHA },
    { tipo: "image/jpeg", bytes: 5000, sha256: "A".repeat(64) },
    { tipo: "image/jpeg", bytes: 5000, sha256: "abc" },
    { tipo: "image/jpeg", bytes: 5000, sha256: `../${"a".repeat(61)}` },
  ]) {
    const r = await pedirSubida("u1", datos, deps);
    assert.ok(!r.ok && r.status === 400, JSON.stringify(datos));
  }
});

test("pedirSubida: sin sesión 401; sin cuenta, en pausa o prueba vencida 403", async () => {
  const sin = await pedirSubida("", { tipo: "image/jpeg", bytes: 1, sha256: SHA }, { store: tienda(), now: AHORA, cfg: CFG });
  assert.ok(!sin.ok && sin.status === 401);
  const otro = await pedirSubida("u9", { tipo: "image/jpeg", bytes: 1, sha256: SHA }, { store: tienda(), now: AHORA, cfg: CFG });
  assert.ok(!otro.ok && otro.status === 403);
  const pausado = await pedirSubida("u1", { tipo: "image/jpeg", bytes: 1, sha256: SHA }, { store: tienda({ estado: "pausado" }), now: AHORA, cfg: CFG });
  assert.ok(!pausado.ok && pausado.status === 403);
});

test("pedirSubida sin configuración de R2 → 503 con mensaje claro", async () => {
  const r = await pedirSubida("u1", { tipo: "image/jpeg", bytes: 1, sha256: SHA }, { store: tienda(), now: AHORA, cfg: null });
  assert.deepEqual(r, { ok: false, status: 503, error: "Falta configurar el almacenamiento de videos. Avísale a InnovationTECH." });
});

test("subirDesdeUrl: descarga el clip y lo sube a R2 con PUT firmado", async () => {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    if (llamadas.length === 1) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    return new Response("", { status: 200 });
  }) as typeof fetch;
  await subirDesdeUrl("https://v3.fal.media/files/clip.mp4", "negocios/n1/clips/t1.mp4", "video/mp4", f, CFG);
  assert.equal(llamadas[0].url, "https://v3.fal.media/files/clip.mp4");
  const put = new URL(llamadas[1].url);
  assert.equal(llamadas[1].init?.method, "PUT");
  assert.equal(put.pathname, "/studio-videos/negocios/n1/clips/t1.mp4");
  assert.equal((llamadas[1].init?.headers as Record<string, string>)["Content-Type"], "video/mp4");
  assert.equal((llamadas[1].init?.body as Uint8Array).byteLength, 3);
});

test("subirDesdeUrl: falla si la descarga o la subida fallan, o si el origen no es https", async () => {
  const mal = (async () => new Response("", { status: 500 })) as typeof fetch;
  await assert.rejects(subirDesdeUrl("https://v3.fal.media/x.mp4", "k.mp4", "video/mp4", mal, CFG));
  await assert.rejects(subirDesdeUrl("http://169.254.169.254/x", "k.mp4", "video/mp4", mal, CFG));
});
