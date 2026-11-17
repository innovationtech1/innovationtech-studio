import { test } from "node:test";
import assert from "node:assert/strict";
import { TROZO, ErrorDrive, errorDrive, carpetaDrive, iniciarSubida, subirTrozos, guardarEnDrive } from "./drive";
import { enNavegadorDeApp, precargarGoogle, pedirToken, olvidarToken } from "./google-token";

type Peticion = { url: string; method: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal | null };
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
      signal: init?.signal,
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
  assert.equal(errorDrive(429, "").codigo, "OCUPADO");
  assert.equal(errorDrive(403, JSON.stringify({ error: { errors: [{ reason: "userRateLimitExceeded" }] } })).codigo, "OCUPADO");
  assert.equal(errorDrive(403, JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } })).codigo, "OCUPADO");
  assert.equal(new ErrorDrive("OCUPADO").message, "Google Drive está ocupado. Espera un momento y vuelve a intentarlo.");
  assert.equal(errorDrive(404, "").estado, 404);
  assert.equal(errorDrive(401, "").message, "Tu sesión de Google venció. Vuelve a intentarlo.");
  assert.equal(new ErrorDrive("LLENO").message, "Tu Google Drive está lleno. Libera espacio y vuelve a intentarlo.");
  assert.equal(new ErrorDrive("PERMISO").message, "Google no dio permiso para guardar en tu Drive.");
  assert.equal(new ErrorDrive("RED").message, "Se perdió la conexión al subir a Drive. Vuelve a intentarlo.");
  assert.equal(new ErrorDrive("OTRO").message, "No se pudo guardar en Google Drive.");
});

// Drive falso para guardarEnDrive: responde según la URL y el token.
function driveFalso(tokensValidos: string[], sesion: (p: Peticion) => Respuesta = () => json({ id: "arch", webViewLink: "https://ver/arch" })) {
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
    if (p.url === "https://subida/s1") return sesion(p);
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
  // El token nunca va a la URL de la sesión de subida, y los trozos no llevan Authorization.
  assert.ok(peticiones.every((p) => !p.url.includes("viejo") && !p.url.includes("nuevo")));
  const trozos = peticiones.filter((p) => p.url === "https://subida/s1");
  assert.ok(trozos.length > 0);
  assert.ok(trozos.every((p) => p.headers.authorization === undefined));
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

test("subirTrozos: 308 sin avance repetido termina en RED (no se queda en bucle)", async () => {
  let n = 0;
  const { f } = fetchFalso(() => (++n > 20 ? new Error("bucle") : r308()));
  await assert.rejects(
    subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera }),
    (e: unknown) => e instanceof ErrorDrive && e.codigo === "RED",
  );
  assert.equal(n, 3);
});

test("subirTrozos: 308 que confirma todo el archivo → pregunta el estado y termina", async () => {
  const { f, peticiones } = fetchFalso([r308(`bytes=0-${total - 1}`), json({ id: "a", webViewLink: "w" })]);
  const blob = blobGrande();
  const r = await subirTrozos("https://subida/1", blob, { f, esperar: sinEspera, trozo: total });
  assert.equal(r.id, "a");
  assert.equal(peticiones[1].headers["content-range"], `bytes */${total}`);
  assert.equal(peticiones[1].body, undefined);
});

test("subirTrozos: 308 con todo confirmado y el estado sin terminar → RED", async () => {
  const { f } = fetchFalso([r308(`bytes=0-${total - 1}`), r308(`bytes=0-${total - 1}`)]);
  await assert.rejects(
    subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera, trozo: total }),
    (e: unknown) => e instanceof ErrorDrive && e.codigo === "RED",
  );
});

test("subirTrozos: archivo de 0 bytes", async () => {
  const { f, peticiones } = fetchFalso([json({ id: "vacio", webViewLink: "w" })]);
  const avances: number[] = [];
  const r = await subirTrozos("https://subida/1", new Blob([]), { f, esperar: sinEspera, alProgreso: (p) => avances.push(p) });
  assert.equal(r.id, "vacio");
  assert.equal(peticiones.length, 1);
  assert.equal(peticiones[0].headers["content-range"], "bytes */0");
  assert.equal(avances.at(-1), 100);
});

test("subirTrozos: la consulta de estado que responde 200 termina", async () => {
  const { f, peticiones } = fetchFalso([new TypeError("Failed to fetch"), json({ id: "a", webViewLink: "w" })]);
  const r = await subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera });
  assert.equal(r.id, "a");
  assert.equal(peticiones.length, 2);
});

test("subirTrozos: falla, avanza y falla en otro punto no es RED", async () => {
  const { f } = fetchFalso([
    new TypeError("Failed to fetch"),
    r308("bytes=0-1048575"),
    new TypeError("Failed to fetch"),
    r308("bytes=0-2097151"),
    json({ id: "a", webViewLink: "w" }),
  ]);
  const r = await subirTrozos("https://subida/1", blobGrande(), { f, esperar: sinEspera });
  assert.equal(r.id, "a");
});

test("subirTrozos: cancelar durante la espera de 1.5 s termina enseguida", async () => {
  const ctrl = new AbortController();
  const { f } = fetchFalso([new TypeError("Failed to fetch")]);
  const nuncaTermina = () => {
    queueMicrotask(() => ctrl.abort());
    return new Promise<void>(() => {});
  };
  await assert.rejects(
    subirTrozos("https://subida/1", blobGrande(), { f, senal: ctrl.signal, esperar: nuncaTermina }),
    (e: unknown) => e instanceof Error && e.name === "AbortError",
  );
});

test("guardarEnDrive con la señal ya cancelada no hace nada", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const { f, peticiones } = driveFalso(["tk"]);
  let tokens = 0;
  await assert.rejects(
    guardarEnDrive(new Blob([new Uint8Array(10)]), "reel.mp4", {
      token: async () => (tokens++, "tk"),
      tokenNuevo: async () => "tk",
      f,
      senal: ctrl.signal,
      esperar: sinEspera,
    }),
    (e: unknown) => e instanceof Error && e.name === "AbortError",
  );
  assert.equal(peticiones.length, 0);
  assert.equal(tokens, 0);
});

test("guardarEnDrive pasa la señal a la carpeta y al inicio de la subida", async () => {
  const ctrl = new AbortController();
  const { f, peticiones } = driveFalso(["tk"]);
  await guardarEnDrive(new Blob([new Uint8Array(10)]), "reel.mp4", {
    token: async () => "tk",
    tokenNuevo: async () => "tk",
    f,
    senal: ctrl.signal,
    esperar: sinEspera,
  });
  assert.ok(peticiones.length >= 3);
  assert.ok(peticiones.every((p) => p.signal === ctrl.signal));
});

test("guardarEnDrive: sesión de subida vencida (404) abre otra una vez", async () => {
  let intentos = 0;
  const { f, peticiones } = driveFalso(["tk"], () =>
    ++intentos === 1 ? new Response("", { status: 404 }) : json({ id: "arch", webViewLink: "https://ver/arch" }),
  );
  const r = await guardarEnDrive(new Blob([new Uint8Array(10)]), "reel.mp4", {
    token: async () => "tk",
    tokenNuevo: async () => "tk",
    f,
    esperar: sinEspera,
  });
  assert.equal(r.id, "arch");
  assert.equal(peticiones.filter((p) => p.url.includes("/upload/")).length, 2);
});

test("guardarEnDrive: si la sesión vuelve a vencer (404), falla con OTRO", async () => {
  const { f, peticiones } = driveFalso(["tk"], () => new Response("", { status: 404 }));
  await assert.rejects(
    guardarEnDrive(new Blob([new Uint8Array(10)]), "reel.mp4", {
      token: async () => "tk",
      tokenNuevo: async () => "tk",
      f,
      esperar: sinEspera,
    }),
    (e: unknown) => e instanceof ErrorDrive && e.codigo === "OTRO",
  );
  assert.equal(peticiones.filter((p) => p.url.includes("/upload/")).length, 2);
});

// ---------- Token de Google (navegador) ----------

test("enNavegadorDeApp detecta Instagram, Facebook y TikTok y no Chrome ni Safari", () => {
  const dentro = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1]",
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 musical_ly_2023 TikTok",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.0.0",
  ];
  const fuera = [
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  ];
  for (const ua of dentro) assert.equal(enNavegadorDeApp(ua), true, ua);
  for (const ua of fuera) assert.equal(enNavegadorDeApp(ua), false, ua);
});

// Google Identity Services falso: guarda la configuración y deja responder a mano.
type ConfigGis = {
  client_id: string;
  scope: string;
  callback: (r: Record<string, unknown>) => void;
  error_callback: (e: { type: string }) => void;
};
function gisFalso() {
  const estado = { configs: [] as ConfigGis[], pedidos: [] as ({ prompt?: string } | undefined)[] };
  const g = globalThis as unknown as { window?: unknown; google?: unknown };
  g.window = globalThis;
  g.google = {
    accounts: {
      oauth2: {
        initTokenClient: (c: ConfigGis) => {
          estado.configs.push(c);
          return { requestAccessToken: (o?: { prompt?: string }) => estado.pedidos.push(o) };
        },
      },
    },
  };
  const ultima = () => estado.configs[estado.configs.length - 1];
  return { estado, ultima, limpiar: () => (delete g.google, delete g.window) };
}

test("pedirToken pide el permiso drive.file en el mismo toque y reusa el token mientras no venza", async () => {
  const gis = gisFalso();
  try {
    olvidarToken();
    await precargarGoogle();
    const p = pedirToken("cliente-1");
    assert.equal(gis.estado.pedidos.length, 1, "requestAccessToken se llama sin esperar");
    assert.equal(gis.ultima().scope, "https://www.googleapis.com/auth/drive.file");
    assert.equal(gis.ultima().client_id, "cliente-1");
    gis.ultima().callback({ access_token: "tk1", expires_in: 3599, scope: "https://www.googleapis.com/auth/drive.file" });
    assert.equal(await p, "tk1");
    assert.equal(await pedirToken("cliente-1"), "tk1");
    assert.equal(gis.estado.pedidos.length, 1, "no vuelve a abrir Google");
    assert.equal(gis.estado.configs.length, 1, "el cliente se crea una vez");

    olvidarToken();
    const p2 = pedirToken("cliente-1", { prompt: "" });
    assert.deepEqual(gis.estado.pedidos[1], { prompt: "" });
    gis.ultima().callback({ access_token: "tk2", expires_in: 3599, scope: "https://www.googleapis.com/auth/drive.file" });
    assert.equal(await p2, "tk2");
  } finally {
    olvidarToken();
    gis.limpiar();
  }
});

test("pedirToken: token a punto de vencer (≤ 60 s) se vuelve a pedir", async () => {
  const gis = gisFalso();
  try {
    olvidarToken();
    const p = pedirToken("cliente-1");
    gis.ultima().callback({ access_token: "corto", expires_in: 30, scope: "https://www.googleapis.com/auth/drive.file" });
    assert.equal(await p, "corto");
    const p2 = pedirToken("cliente-1");
    assert.equal(gis.estado.pedidos.length, 2);
    gis.ultima().callback({ access_token: "largo", expires_in: 3599, scope: "https://www.googleapis.com/auth/drive.file" });
    assert.equal(await p2, "largo");
  } finally {
    olvidarToken();
    gis.limpiar();
  }
});

test("pedirToken: ventana bloqueada da un mensaje claro; cerrar la ventana es cancelar; sin permiso es PERMISO", async () => {
  const gis = gisFalso();
  try {
    olvidarToken();
    const p1 = pedirToken("cliente-1");
    gis.ultima().error_callback({ type: "popup_failed_to_open" });
    await assert.rejects(p1, { message: "Google no pudo abrir su ventana. Revisa que no estén bloqueadas las ventanas emergentes." });

    const p2 = pedirToken("cliente-1");
    gis.ultima().error_callback({ type: "popup_closed" });
    await assert.rejects(p2, { name: "AbortError" });

    const p3 = pedirToken("cliente-1");
    gis.ultima().callback({ error: "access_denied" });
    await assert.rejects(p3, (e: unknown) => e instanceof ErrorDrive && e.codigo === "PERMISO");

    // Quitó la casilla de Drive en la pantalla de Google: el token no sirve para guardar.
    const p4 = pedirToken("cliente-1");
    gis.ultima().callback({ access_token: "sin-drive", expires_in: 3599, scope: "email profile" });
    await assert.rejects(p4, (e: unknown) => e instanceof ErrorDrive && e.codigo === "PERMISO");
  } finally {
    olvidarToken();
    gis.limpiar();
  }
});

// ---------- Correcciones de la revisión final ----------

test("errorDrive: 403 accessNotConfigured (API de Drive sin activar) es CONFIG con un mensaje para avisar al equipo", () => {
  const cuerpo = JSON.stringify({ error: { errors: [{ reason: "accessNotConfigured" }], status: "PERMISSION_DENIED" } });
  const e = errorDrive(403, cuerpo);
  assert.equal(e.codigo, "CONFIG");
  assert.equal(e.message, "Google Drive no está activado para Studio. Avísale al equipo de InnovationTECH.");
  assert.equal(errorDrive(403, "texto con accessNotConfigured adentro").codigo, "CONFIG");
});

test("guardarEnDrive: «Cancelar» mientras se espera la ventana de Google termina de inmediato (AbortError) sin tocar Drive", async () => {
  const ctrl = new AbortController();
  const { f, peticiones } = fetchFalso([]);
  const p = guardarEnDrive(new Blob([new Uint8Array(10)]), "reel.mp4", {
    token: () => new Promise<string>(() => {}), // la persona no responde en la ventana de Google
    tokenNuevo: async () => "tk",
    f,
    senal: ctrl.signal,
  });
  ctrl.abort();
  await assert.rejects(p, { name: "AbortError" });
  assert.equal(peticiones.length, 0);
});

test("enNavegadorDeApp también detecta el WebView de Android, Snapchat, LinkedIn y el de ByteDance", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.20.0.39 (like Safari/8618.1.15.10.15)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1",
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6",
  ]) {
    assert.equal(enNavegadorDeApp(ua), true, ua);
  }
  // Chrome normal de Android no lleva «; wv)».
  assert.equal(enNavegadorDeApp("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36"), false);
});
