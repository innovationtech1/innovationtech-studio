import { test } from "node:test";
import assert from "node:assert/strict";
import { borrarCarpeta, carpetaFotos, carpetasNegocio, configR2, firmarUrl, llaveClip, pedirSubida, prefirmar, subirDesdeUrl } from "./r2";
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

// ---------- Borrar la carpeta de un negocio (al borrar la cuenta) ----------

test("prefirmar: los datos extra de la consulta van firmados y en orden", () => {
  const base = {
    metodo: "GET" as const,
    host: "examplebucket.s3.amazonaws.com",
    ruta: "/",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    segundos: 60,
    ahora: new Date("2013-05-24T00:00:00Z"),
  };
  const a = prefirmar({ ...base, consulta: { prefix: "negocios/n1/", "list-type": "2" } });
  const b = prefirmar({ ...base, consulta: { "list-type": "2", prefix: "negocios/n1/" } });
  assert.equal(a, b); // el orden en que se pasan no importa
  assert.match(a, /X-Amz-SignedHeaders=host&list-type=2&prefix=negocios%2Fn1%2F&X-Amz-Signature=[0-9a-f]{64}$/);
  const otra = prefirmar({ ...base, consulta: { "list-type": "2", prefix: "negocios/n2/" } });
  assert.notEqual(a.split("Signature=")[1], otra.split("Signature=")[1]); // cambiar la consulta cambia la firma
});

const R2P = { accountId: "acc", accessKeyId: "AK", secretAccessKey: "SK", bucket: "studio" };
const xml = (llaves: string[], sigue?: string) =>
  `<?xml version="1.0"?><ListBucketResult><IsTruncated>${sigue ? "true" : "false"}</IsTruncated>` +
  llaves.map((k) => `<Contents><Key>${k.replace(/&/g, "&amp;")}</Key></Contents>`).join("") +
  (sigue ? `<NextContinuationToken>${sigue}</NextContinuationToken>` : "") +
  `</ListBucketResult>`;

function r2Falso(paginas: string[][], o: { borrarFalla?: boolean; listarFalla?: boolean } = {}) {
  const pedidos: { metodo: string; url: URL }[] = [];
  const traer = async (url: string, init?: { method?: string }) => {
    const u = new URL(url);
    const metodo = init?.method ?? "GET";
    pedidos.push({ metodo, url: u });
    if (metodo === "DELETE") return new Response(null, { status: o.borrarFalla ? 500 : 204 });
    if (o.listarFalla) return new Response("no", { status: 403 });
    const token = u.searchParams.get("continuation-token");
    const i = token ? Number(token) : 0;
    return new Response(xml(paginas[i] ?? [], i + 1 < paginas.length ? String(i + 1) : undefined), { status: 200 });
  };
  return { pedidos, traer: traer as typeof fetch };
}

test("borrarCarpeta: lista todas las páginas y borra cada archivo de esa carpeta", async () => {
  const f = r2Falso([["negocios/n1/fotos/a.jpg", "negocios/n1/clips/t1.mp4"], ["negocios/n1/fotos/b&c.jpg"]]);
  const n = await borrarCarpeta("negocios/n1/", { cfg: R2P, traer: f.traer });
  assert.equal(n, 3);
  const listas = f.pedidos.filter((p) => p.metodo === "GET");
  assert.equal(listas.length, 2);
  assert.equal(listas[0].url.searchParams.get("prefix"), "negocios/n1/");
  assert.equal(listas[0].url.searchParams.get("list-type"), "2");
  const borrados = f.pedidos.filter((p) => p.metodo === "DELETE").map((p) => decodeURIComponent(p.url.pathname));
  assert.deepEqual(borrados.sort(), ["/studio/negocios/n1/clips/t1.mp4", "/studio/negocios/n1/fotos/a.jpg", "/studio/negocios/n1/fotos/b&c.jpg"]);
});

test("borrarCarpeta: solo acepta la carpeta de UN negocio (nunca el almacén entero ni la de todos)", async () => {
  const f = r2Falso([["x"]]);
  for (const malo of ["", "/", "negocios/", "demo/", "negocios/n1", "negocios/n1/fotos/", "otros/n1/", "negocios/../", "negocios/n1/../n2/"]) {
    await assert.rejects(borrarCarpeta(malo, { cfg: R2P, traer: f.traer }), /carpeta/i, malo);
  }
  assert.equal(f.pedidos.length, 0);
  assert.equal(await borrarCarpeta("demo/negocios/n1/", { cfg: R2P, traer: r2Falso([[]]).traer }), 0);
});

test("borrarCarpeta: nunca borra un archivo que no sea de esa carpeta, aunque la lista lo traiga", async () => {
  const f = r2Falso([["negocios/n1/fotos/a.jpg", "negocios/n2/fotos/ajena.jpg"]]);
  await assert.rejects(borrarCarpeta("negocios/n1/", { cfg: R2P, traer: f.traer }));
  assert.ok(!f.pedidos.some((p) => p.metodo === "DELETE" && p.url.pathname.includes("n2")));
});

test("borrarCarpeta: si no se puede listar o borrar, falla (para que quede anotado)", async () => {
  await assert.rejects(borrarCarpeta("negocios/n1/", { cfg: R2P, traer: r2Falso([["negocios/n1/a"]], { listarFalla: true }).traer }));
  await assert.rejects(borrarCarpeta("negocios/n1/", { cfg: R2P, traer: r2Falso([["negocios/n1/a"]], { borrarFalla: true }).traer }));
  await assert.rejects(borrarCarpeta("negocios/n1/", { cfg: null }), /R2/);
});

// ---------- Pruebas y producción comparten el bucket: cada una en su carpeta ----------

async function conPrefijo<T>(prefijo: string | undefined, f: () => Promise<T> | T): Promise<T> {
  const antes = process.env.STUDIO_COLECCION_PREFIJO;
  if (prefijo === undefined) delete process.env.STUDIO_COLECCION_PREFIJO;
  else process.env.STUDIO_COLECCION_PREFIJO = prefijo;
  try {
    return await f();
  } finally {
    if (antes === undefined) delete process.env.STUDIO_COLECCION_PREFIJO;
    else process.env.STUDIO_COLECCION_PREFIJO = antes;
  }
}

test("llaves de R2 en producción: las de siempre", async () => {
  await conPrefijo(undefined, () => {
    assert.equal(carpetaFotos("n1", "pro"), "negocios/n1/fotos/");
    assert.equal(carpetaFotos("n1", "prueba"), "demo/negocios/n1/fotos/");
    assert.equal(llaveClip("n1", "pro", "t1"), "negocios/n1/clips/t1.mp4");
    assert.equal(llaveClip("n1", "prueba", "t1"), "demo/negocios/n1/clips/t1.mp4");
    assert.deepEqual(carpetasNegocio("n1"), ["negocios/n1/", "demo/negocios/n1/"]);
  });
});

test("llaves de R2 en la versión de prueba: bajo pruebas/ (y demo/pruebas/ para la prueba gratis)", async () => {
  await conPrefijo("prueba_studio_", async () => {
    assert.equal(carpetaFotos("n1", "pro"), "pruebas/negocios/n1/fotos/");
    assert.equal(carpetaFotos("n1", "prueba"), "demo/pruebas/negocios/n1/fotos/");
    assert.equal(llaveClip("n1", "basico", "t1"), "pruebas/negocios/n1/clips/t1.mp4");
    assert.equal(llaveClip("n1", "prueba", "t1"), "demo/pruebas/negocios/n1/clips/t1.mp4");
    assert.deepEqual(carpetasNegocio("n1"), ["pruebas/negocios/n1/", "demo/pruebas/negocios/n1/"]);
    const r = await pedirSubida("u1", { tipo: "image/jpeg", bytes: 1000, sha256: SHA }, { store: tienda(), now: AHORA, cfg: CFG, stripeLive: false });
    assert.ok(r.ok && r.imagenKey === `pruebas/negocios/n1/fotos/${SHA}.jpg`);
  });
});

test("borrarCarpeta: cada versión solo borra sus propias carpetas (pruebas nunca borra producción)", async () => {
  const R2P = { ...CFG, bucket: "studio" };
  const vacio = () => r2Falso([[]]).traer;
  await conPrefijo("prueba_studio_", async () => {
    for (const ajena of ["negocios/n1/", "demo/negocios/n1/"]) await assert.rejects(borrarCarpeta(ajena, { cfg: R2P, traer: vacio() }), /no permitida/, ajena);
    assert.equal(await borrarCarpeta("pruebas/negocios/n1/", { cfg: R2P, traer: vacio() }), 0);
    assert.equal(await borrarCarpeta("demo/pruebas/negocios/n1/", { cfg: R2P, traer: vacio() }), 0);
  });
  await conPrefijo(undefined, async () => {
    for (const ajena of ["pruebas/negocios/n1/", "demo/pruebas/negocios/n1/"]) await assert.rejects(borrarCarpeta(ajena, { cfg: R2P, traer: vacio() }), /no permitida/, ajena);
  });
});
