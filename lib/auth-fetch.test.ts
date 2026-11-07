import { test } from "node:test";
import assert from "node:assert/strict";
import { installAuthFetch } from "./auth-fetch";

const ORIGEN = "https://studio.ejemplo.com";

type Llamada = { url: string; auth: string | null; body: string | null };

// Un "fetch" falso: guarda cada llamada y responde con lo que diga la lista (o 200 si se acaba).
function falso(respuestas: Array<() => Response> = []) {
  const llamadas: Llamada[] = [];
  const target = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(new URL(input instanceof Request ? input.url : String(input), ORIGEN), init && { ...init });
      const fuente = input instanceof Request && !init?.body ? input : req;
      // Lee (y gasta) el cuerpo, como el fetch real
      const body = fuente.body ? await fuente.text() : null;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      llamadas.push({ url: req.url, auth: headers.get("authorization"), body });
      const r = respuestas.shift();
      return r ? r() : new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  };
  return { target, llamadas };
}

const json401 = (codigo: string) => () =>
  new Response(JSON.stringify({ error: "Inicia sesión para continuar.", codigo }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

function tokens() {
  const pedidos: boolean[] = [];
  const getToken = async (forzar: boolean) => {
    pedidos.push(forzar);
    return forzar ? "nuevo" : "viejo";
  };
  return { getToken, pedidos };
}

test("agrega el encabezado Authorization a /api/text", async () => {
  const { target, llamadas } = falso();
  const { getToken } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  await target.fetch("/api/text", { method: "POST", body: "{}" });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].auth, "Bearer viejo");
});

test("también firma URLs absolutas del mismo origen, objetos URL y Request", async () => {
  const { target, llamadas } = falso();
  const { getToken } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  await target.fetch(`${ORIGEN}/api/image`);
  await target.fetch(new URL("/api/voice", ORIGEN));
  await target.fetch(new Request(`${ORIGEN}/api/cuenta`));
  assert.deepEqual(
    llamadas.map((l) => l.auth),
    ["Bearer viejo", "Bearer viejo", "Bearer viejo"],
  );
});

test("no agrega el encabezado a otro dominio ni a /api/stripe/webhook ni fuera de /api/", async () => {
  const { target, llamadas } = falso();
  const { getToken, pedidos } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  await target.fetch("https://otro.com/api/x");
  await target.fetch("/api/stripe/webhook", { method: "POST", body: "{}" });
  await target.fetch("/icons/icon-192.png");
  await target.fetch("/apix");
  assert.deepEqual(
    llamadas.map((l) => l.auth),
    [null, null, null, null],
  );
  assert.equal(pedidos.length, 0);
});

test("no reemplaza un Authorization que ya venía", async () => {
  const { target, llamadas } = falso();
  const { getToken } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  await target.fetch("/api/text", { headers: { Authorization: "Bearer mio" } });
  assert.equal(llamadas[0].auth, "Bearer mio");
});

test("ante 401 con codigo SESION pide un token forzado y reintenta una vez", async () => {
  const { target, llamadas } = falso([json401("SESION")]);
  const { getToken, pedidos } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  const res = await target.fetch("/api/text", { method: "POST", body: '{"a":1}' });
  assert.equal(res.status, 200);
  assert.equal(llamadas.length, 2);
  assert.deepEqual(pedidos, [false, true]);
  assert.equal(llamadas[1].auth, "Bearer nuevo");
  assert.equal(llamadas[1].body, '{"a":1}');
});

test("ante un segundo 401 devuelve esa respuesta sin más reintentos", async () => {
  const { target, llamadas } = falso([json401("SESION"), json401("SESION")]);
  const { getToken } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  const res = await target.fetch("/api/text");
  assert.equal(res.status, 401);
  assert.equal(llamadas.length, 2);
  // La respuesta se puede leer completa (no se consumió al revisarla)
  assert.deepEqual(await res.json(), { error: "Inicia sesión para continuar.", codigo: "SESION" });
});

test("un 401 sin codigo SESION no se reintenta", async () => {
  const { target, llamadas } = falso([json401("OTRO")]);
  const { getToken } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  const res = await target.fetch("/api/text");
  assert.equal(res.status, 401);
  assert.equal(llamadas.length, 1);
});

test("un Request con cuerpo se reintenta con el mismo cuerpo", async () => {
  const { target, llamadas } = falso([json401("SESION")]);
  const { getToken } = tokens();
  installAuthFetch(getToken, { target, origin: ORIGEN });
  const res = await target.fetch(new Request(`${ORIGEN}/api/text`, { method: "POST", body: "hola" }));
  assert.equal(res.status, 200);
  assert.deepEqual(
    llamadas.map((l) => [l.auth, l.body]),
    [
      ["Bearer viejo", "hola"],
      ["Bearer nuevo", "hola"],
    ],
  );
});

test("sin token no agrega el encabezado", async () => {
  const { target, llamadas } = falso();
  installAuthFetch(async () => null, { target, origin: ORIGEN });
  await target.fetch("/api/text");
  assert.equal(llamadas[0].auth, null);
});

test("avisa el codigo de los errores de /api (onCodigo)", async () => {
  const { target } = falso([
    () =>
      new Response(JSON.stringify({ error: "Tu cuenta está en pausa.", codigo: "PAUSADO" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
  ]);
  const { getToken } = tokens();
  const avisos: Array<[string, string]> = [];
  let listo!: () => void;
  const llego = new Promise<void>((r) => (listo = r));
  installAuthFetch(getToken, {
    target,
    origin: ORIGEN,
    onCodigo: (codigo, mensaje) => (avisos.push([codigo, mensaje]), listo()),
  });
  const res = await target.fetch("/api/image");
  assert.equal(res.status, 403);
  await llego;
  assert.deepEqual(avisos, [["PAUSADO", "Tu cuenta está en pausa."]]);
  // Quien llamó todavía puede leer el cuerpo
  assert.equal((await res.json()).codigo, "PAUSADO");
});

test("la función que devuelve deshace el cambio", async () => {
  const { target } = falso();
  const original = target.fetch;
  const deshacer = installAuthFetch(async () => "t", { target, origin: ORIGEN });
  assert.notEqual(target.fetch, original);
  deshacer();
  assert.equal(target.fetch, original);
});
