import { test } from "node:test";
import assert from "node:assert/strict";
import { TROZO, ErrorDrive, errorDrive, carpetaDrive, iniciarSubida, subirTrozos, guardarEnDrive } from "./drive";

type Peticion = { url: string; method: string; headers: Record<string, string>; body: unknown };
type Respuesta = Response | Error;

// fetch falso: guarda cada petición y responde en orden con la lista dada (o con una función).
function fetchFalso(respuestas: Respuesta[] | ((p: Peticion, i: number) => Respuesta)) {
  const peticiones: Peticion[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const p: Peticion = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body,
    };
    const i = peticiones.length;
    peticiones.push(p);
    const r = typeof respuestas === "function" ? respuestas(p, i) : respuestas[i];
    if (!r) throw new Error(`petición inesperada ${i}: ${p.method} ${p.url}`);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { f, peticiones };
}

const json = (cuerpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json", ...headers } });
const r308 = (range?: string) => new Response(null, { status: 308, headers: range ? { Range: range } : {} });
const sinEspera = async () => {};

test("carpetaDrive reutiliza la guardada", async () => {
  const { f, peticiones } = fetchFalso([json({ id: "c1", trashed: false })]);
  assert.equal(await carpetaDrive("tk", f, "c1"), "c1");
  assert.equal(peticiones.length, 1);
  assert.equal(peticiones[0].url, "https://www.googleapis.com/drive/v3/files/c1?fields=id,trashed");
  assert.equal(peticiones[0].headers.authorization, "Bearer tk");
});

test("carpetaDrive busca por nombre", async () => {
  const { f, peticiones } = fetchFalso([json({ files: [{ id: "c9" }, { id: "c8" }] })]);
  assert.equal(await carpetaDrive("tk", f), "c9");
  const u = new URL(peticiones[0].url);
  assert.equal(u.origin + u.pathname, "https://www.googleapis.com/drive/v3/files");
  assert.equal(
    u.searchParams.get("q"),
    "name='InnovationTECH Studio' and mimeType='application/vnd.google-apps.folder' and trashed=false",
  );
  assert.equal(u.searchParams.get("fields"), "files(id)");
});

test("carpetaDrive crea la carpeta cuando no hay", async () => {
  const { f, peticiones } = fetchFalso([json({ files: [] }), json({ id: "nueva" })]);
  assert.equal(await carpetaDrive("tk", f, null), "nueva");
  const crear = peticiones[1];
  assert.equal(crear.method, "POST");
  assert.ok(crear.url.startsWith("https://www.googleapis.com/drive/v3/files"));
  assert.equal(crear.headers.authorization, "Bearer tk");
  const cuerpo = JSON.parse(String(crear.body));
  assert.equal(cuerpo.name, "InnovationTECH Studio");
  assert.equal(cuerpo.mimeType, "application/vnd.google-apps.folder");
});

test("carpetaDrive ignora la guardada si está en la papelera", async () => {
  const { f, peticiones } = fetchFalso([json({ id: "c1", trashed: true }), json({ files: [{ id: "c2" }] })]);
  assert.equal(await carpetaDrive("tk", f, "c1"), "c2");
  assert.equal(peticiones.length, 2);
});

test("carpetaDrive con la guardada borrada (404) busca otra", async () => {
  const { f } = fetchFalso([json({ error: {} }, 404), json({ files: [] }), json({ id: "c3" })]);
  assert.equal(await carpetaDrive("tk", f, "vieja"), "c3");
});

test("iniciarSubida manda los encabezados y devuelve Location", async () => {
  const { f, peticiones } = fetchFalso([new Response(null, { status: 200, headers: { Location: "https://subida/123" } })]);
  const url = await iniciarSubida("tk", { nombre: "reel.mp4", tipo: "video/mp4", tamano: 1234, carpeta: "c1" }, f);
  assert.equal(url, "https://subida/123");
  const p = peticiones[0];
  assert.equal(p.method, "POST");
  assert.equal(p.url, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink");
  assert.equal(p.headers.authorization, "Bearer tk");
  assert.equal(p.headers["content-type"], "application/json; charset=UTF-8");
  assert.equal(p.headers["x-upload-content-type"], "video/mp4");
  assert.equal(p.headers["x-upload-content-length"], "1234");
  assert.deepEqual(JSON.parse(String(p.body)), { name: "reel.mp4", parents: ["c1"] });
});

const total = TROZO + 10;
const blobGrande = () => new Blob([new Uint8Array(total)], { type: "video/mp4" });

test("subirTrozos sube en trozos de 8 MiB con Content-Range correcto", async () => {
  assert.equal(TROZO, 8 * 1024 * 1024);
  const { f, peticiones } = fetchFalso([r308(`bytes=0-${TROZO - 1}`), json({ id: "a1", webViewLink: "https://ver" }, 201)]);
  const avances: number[] = [];
  const r = await subirTrozos("https://subida/1", blobGrande(), { f, alProgreso: (p) => avances.push(p), esperar: sinEspera });
  assert.deepEqual(r, { id: "a1", webViewLink: "https://ver" });
  assert.equal(peticiones.length, 2);
  assert.equal(peticiones[0].method, "PUT");
  assert.equal(peticiones[0].headers["content-range"], "bytes 0-8388607/8388618");
  assert.equal(peticiones[1].headers["content-range"], "bytes 8388608-8388617/8388618");
  assert.equal(avances.at(-1), 100);
  assert.ok(avances.every((p) => Number.isInteger(p) && p >= 0 && p <= 100));
});

test("subirTrozos solo lee un trozo a la vez", async () => {
  const blob = blobGrande();
  blob.arrayBuffer = () => {
    throw new Error("leyó el archivo completo");
  };
  const { f, peticiones } = fetchFalso([r308(`bytes=0-${TROZO - 1}`), json({ id: "a1", webViewLink: "w" })]);
  await subirTrozos("https://subida/1", blob, { f, esperar: sinEspera });
  for (const p of peticiones) {
    assert.ok(p.body instanceof Blob);
    assert.ok((p.body as Blob).size <= TROZO);
  }
});

test("subirTrozos retoma desde el Range confirmado", async () => {
  const { f, peticiones } = fetchFalso([r308("bytes=0-4194303"), json({ id: "a", webViewLink: "w" })]);
  await subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera });
  assert.equal(peticiones.length, 2);
  assert.equal(peticiones[1].headers["content-range"], `bytes 4194304-${total - 1}/${total}`);
  assert.equal((peticiones[1].body as Blob).size, total - 4194304);
});

test("subirTrozos ante corte de red pregunta el estado y sigue", async () => {
  const esperas: number[] = [];
  const { f, peticiones } = fetchFalso([
    new TypeError("Failed to fetch"),
    r308("bytes=0-1048575"),
    json({ id: "a", webViewLink: "w" }),
  ]);
  const r = await subirTrozos("https://subida/1", blobGrande(), { f, esperar: async (ms) => void esperas.push(ms) });
  assert.equal(r.id, "a");
  assert.deepEqual(esperas, [1500]);
  assert.equal(peticiones[1].method, "PUT");
  assert.equal(peticiones[1].headers["content-range"], `bytes */${total}`);
  assert.equal(peticiones[2].headers["content-range"], `bytes 1048576-${total - 1}/${total}`);
});

test("subirTrozos ante error 503 también pregunta el estado", async () => {
  const { f, peticiones } = fetchFalso([new Response("", { status: 503 }), r308(), r308(`bytes=0-${TROZO - 1}`), json({ id: "a", webViewLink: "w" })]);
  await subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera });
  assert.equal(peticiones[2].headers["content-range"], `bytes 0-${TROZO - 1}/${total}`);
});

test("subirTrozos: dos fallos seguidos → RED", async () => {
  const { f } = fetchFalso([new TypeError("Failed to fetch"), r308(), new TypeError("Failed to fetch")]);
  await assert.rejects(
    subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera }),
    (e: unknown) => e instanceof ErrorDrive && e.codigo === "RED",
  );
});

test("subirTrozos: 4xx se traduce con errorDrive", async () => {
  const { f } = fetchFalso([new Response("", { status: 401 })]);
  await assert.rejects(
    subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera }),
    (e: unknown) => e instanceof ErrorDrive && e.codigo === "TOKEN",
  );
});

test("subirTrozos: cancelar vuelve a lanzar el AbortError", async () => {
  const ctrl = new AbortController();
  const { f } = fetchFalso(() => {
    ctrl.abort();
    return Object.assign(new Error("cancelado"), { name: "AbortError" });
  });
  await assert.rejects(
    subirTrozos("https://subida/1", blobGrande(), { f, senal: ctrl.signal, esperar: sinEspera }),
    (e: unknown) => e instanceof Error && e.name === "AbortError",
  );
});

test("errorDrive", () => {
  assert.equal(errorDrive(401, "").codigo, "TOKEN");
  const lleno = JSON.stringify({ error: { code: 403, errors: [{ reason: "storageQuotaExceeded" }] } });
  assert.equal(errorDrive(403, lleno).codigo, "LLENO");
  assert.equal(errorDrive(403, JSON.stringify({ error: { errors: [{ reason: "insufficientPermissions" }] } })).codigo, "PERMISO");
  assert.equal(errorDrive(403, "no es json").codigo, "PERMISO");
  assert.equal(errorDrive(500, "").codigo, "OTRO");
  assert.equal(errorDrive(401, "").message, "Tu sesión de Google venció. Vuelve a intentarlo.");
  assert.equal(new ErrorDrive("LLENO").message, "Tu Google Drive está lleno. Libera espacio y vuelve a intentarlo.");
  assert.equal(new ErrorDrive("PERMISO").message, "Google no dio permiso para guardar en tu Drive.");
  assert.equal(new ErrorDrive("RED").message, "Se perdió la conexión al subir a Drive. Vuelve a intentarlo.");
  assert.equal(new ErrorDrive("OTRO").message, "No se pudo guardar en Google Drive.");
});

// Drive falso para guardarEnDrive: responde según la URL y el token.
function driveFalso(tokensValidos: string[]) {
  return fetchFalso((p) => {
    const tk = p.headers.authorization?.replace("Bearer ", "");
    if (p.url.startsWith("https://www.googleapis.com/") && !tokensValidos.includes(tk ?? "")) {
      return new Response(JSON.stringify({ error: { code: 401 } }), { status: 401 });
    }
    if (p.url.startsWith("https://www.googleapis.com/drive/v3/files?q=") || p.url.includes("/drive/v3/files?q=")) {
      return json({ files: [{ id: "carp" }] });
    }
    if (p.url.startsWith("https://www.googleapis.com/upload/")) {
      return new Response(null, { status: 200, headers: { Location: "https://subida/s1" } });
    }
    if (p.url === "https://subida/s1") return json({ id: "arch", webViewLink: "https://ver/arch" });
    return new Error(`petición inesperada ${p.method} ${p.url}`);
  });
}

test("guardarEnDrive con token vencido pide uno nuevo una vez y termina", async () => {
  const { f, peticiones } = driveFalso(["nuevo"]);
  let nuevos = 0;
  const guardadas: string[] = [];
  const avances: number[] = [];
  const r = await guardarEnDrive(new Blob([new Uint8Array(10)], { type: "video/mp4" }), "reel.mp4", {
    token: async () => "viejo",
    tokenNuevo: async () => {
      nuevos++;
      return "nuevo";
    },
    f,
    guardarCarpeta: (id) => guardadas.push(id),
    alProgreso: (p) => avances.push(p),
    esperar: sinEspera,
  });
  assert.deepEqual(r, { id: "arch", webViewLink: "https://ver/arch" });
  assert.equal(nuevos, 1);
  assert.deepEqual(guardadas, ["carp"]);
  assert.equal(avances.at(-1), 100);
  const inicio = peticiones.find((p) => p.url.includes("/upload/"));
  assert.equal(inicio?.headers["x-upload-content-type"], "video/mp4");
  assert.equal(inicio?.headers["x-upload-content-length"], "10");
  // El token nunca va a la URL de la sesión de subida.
  assert.ok(peticiones.every((p) => !p.url.includes("viejo") && !p.url.includes("nuevo")));
});

test("guardarEnDrive: si vuelve a vencer, falla con TOKEN", async () => {
  const { f } = driveFalso([]);
  let nuevos = 0;
  await assert.rejects(
    guardarEnDrive(new Blob([new Uint8Array(10)]), "reel.mp4", {
      token: async () => "viejo",
      tokenNuevo: async () => {
        nuevos++;
        return "otro";
      },
      f,
      esperar: sinEspera,
    }),
    (e: unknown) => e instanceof ErrorDrive && e.codigo === "TOKEN" && !e.message.includes("viejo") && !e.message.includes("otro"),
  );
  assert.equal(nuevos, 1);
});
