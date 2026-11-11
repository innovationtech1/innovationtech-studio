import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { entradaDeModelo, enviarAFal, estadoFal, resultadoFal, verificarFirmaFal } from "./fal";

const AHORA = 1_800_000_000; // segundos
const par = generateKeyPairSync("ed25519");
const x = (par.publicKey.export({ format: "jwk" }) as { x: string }).x;
const jwks = async () => [{ x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, { x }];

function firmado(cuerpo: string, ts = AHORA, requestId = "req-1", userId = "usuario-1") {
  const hash = createHash("sha256").update(cuerpo).digest("hex");
  const firma = sign(null, Buffer.from([requestId, userId, String(ts), hash].join("\n"), "utf8"), par.privateKey).toString("hex");
  return new Headers({
    "X-Fal-Webhook-Request-Id": requestId,
    "X-Fal-Webhook-User-Id": userId,
    "X-Fal-Webhook-Timestamp": String(ts),
    "X-Fal-Webhook-Signature": firma,
  });
}

test("verificarFirmaFal: firma ED25519 válida (con cualquiera de las llaves publicadas)", async () => {
  const cuerpo = '{"request_id":"req-1","status":"OK"}';
  assert.equal(await verificarFirmaFal(firmado(cuerpo), cuerpo, AHORA * 1000, jwks), true);
});

test("verificarFirmaFal: inválida si cambia el cuerpo", async () => {
  const cuerpo = '{"request_id":"req-1","status":"OK"}';
  assert.equal(await verificarFirmaFal(firmado(cuerpo), cuerpo.replace("OK", "ERROR"), AHORA * 1000, jwks), false);
});

test("verificarFirmaFal: inválida si el timestamp se pasa de 300 s (antes o después)", async () => {
  const cuerpo = "{}";
  assert.equal(await verificarFirmaFal(firmado(cuerpo, AHORA - 301), cuerpo, AHORA * 1000, jwks), false);
  assert.equal(await verificarFirmaFal(firmado(cuerpo, AHORA + 301), cuerpo, AHORA * 1000, jwks), false);
  assert.equal(await verificarFirmaFal(firmado(cuerpo, AHORA - 299), cuerpo, AHORA * 1000, jwks), true);
});

test("verificarFirmaFal: falta un encabezado, firma mal escrita o JWKS caído → false (sin tronar)", async () => {
  const cuerpo = "{}";
  const h = firmado(cuerpo);
  h.delete("X-Fal-Webhook-User-Id");
  assert.equal(await verificarFirmaFal(h, cuerpo, AHORA * 1000, jwks), false);
  const h2 = firmado(cuerpo);
  h2.set("X-Fal-Webhook-Signature", "no-es-hex");
  assert.equal(await verificarFirmaFal(h2, cuerpo, AHORA * 1000, jwks), false);
  const caido = async () => {
    throw new Error("sin red");
  };
  assert.equal(await verificarFirmaFal(firmado(cuerpo), cuerpo, AHORA * 1000, caido), false);
});

test("enviarAFal: arma la URL de la cola con el webhook codificado y la clave en Authorization", async () => {
  const vistas: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    vistas.push({ url: String(url), init });
    return Response.json({ request_id: "req-9", status_url: "https://queue.fal.run/x/requests/req-9/status", response_url: "https://queue.fal.run/x/requests/req-9" });
  }) as typeof fetch;
  const webhook = "https://studio.example/api/video-ia/aviso?t=t1&s=abc";
  const r = await enviarAFal("fal-ai/kling-video/v2.5-turbo/pro/image-to-video", { image_url: "https://r2/x.jpg", prompt: "zoom lento", duration: "5" }, webhook, f, "clave-fal");
  assert.deepEqual(r, { requestId: "req-9", statusUrl: "https://queue.fal.run/x/requests/req-9/status", responseUrl: "https://queue.fal.run/x/requests/req-9" });
  assert.equal(vistas[0].url, `https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/image-to-video?fal_webhook=${encodeURIComponent(webhook)}`);
  assert.equal(vistas[0].init?.method, "POST");
  const h = vistas[0].init?.headers as Record<string, string>;
  assert.equal(h.Authorization, "Key clave-fal");
  assert.deepEqual(JSON.parse(String(vistas[0].init?.body)), { image_url: "https://r2/x.jpg", prompt: "zoom lento", duration: "5" });
});

test("enviarAFal: modelo con forma rara, sin clave o respuesta mala → error", async () => {
  const ok = (async () => Response.json({ request_id: "r" })) as typeof fetch;
  await assert.rejects(enviarAFal("../otro?x=1", { image_url: "u", prompt: "p" }, "https://w", ok, "k"));
  await assert.rejects(enviarAFal("fal-ai/m", { image_url: "u", prompt: "p" }, "https://w", ok, ""));
  const mal = (async () => new Response("no", { status: 401 })) as typeof fetch;
  await assert.rejects(enviarAFal("fal-ai/m", { image_url: "u", prompt: "p" }, "https://w", mal, "k"), /401/);
  await assert.rejects(enviarAFal("fal-ai/m", { image_url: "u", prompt: "p" }, "https://w", ok, "k")); // sin status_url
});

test("estadoFal y resultadoFal: solo consultan a fal.run y leen el video", async () => {
  const f = (async (url: string | URL | Request) =>
    String(url).endsWith("/status") ? Response.json({ status: "COMPLETED" }) : Response.json({ video: { url: "https://v3.fal.media/c.mp4" } })) as typeof fetch;
  assert.equal(await estadoFal("https://queue.fal.run/x/requests/r/status", f, "k"), "COMPLETED");
  assert.deepEqual(await resultadoFal("https://queue.fal.run/x/requests/r", f, "k"), { videoUrl: "https://v3.fal.media/c.mp4" });
  await assert.rejects(estadoFal("https://otro.sitio/status", f, "k"));
  const sinVideo = (async () => Response.json({ detail: "nada" })) as typeof fetch;
  assert.equal(await resultadoFal("https://queue.fal.run/x/requests/r", sinVideo, "k"), null);
});

test("entradaDeModelo: cada familia de modelos recibe los parámetros que acepta", () => {
  // MiniMax H3: duración en número, resolución y expansión del texto
  assert.deepEqual(entradaDeModelo({ id: "minimax/h3-max-turbo/image-to-video", resolucion: "768P" }, "https://img", "zoom", 5), {
    image_url: "https://img", prompt: "zoom", duration: 5, resolution: "768P", prompt_expansion_mode: "balanced",
  });
  // Kling: duración como texto, sin resolución
  assert.deepEqual(entradaDeModelo({ id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video" }, "https://img", "zoom", 5), {
    image_url: "https://img", prompt: "zoom", duration: "5",
  });
  // Otros (Wan…): duración como texto y la resolución que diga la configuración; sin movimiento va uno genérico
  assert.deepEqual(entradaDeModelo({ id: "fal-ai/wan-25-preview/image-to-video", resolucion: "480p" }, "https://img", "", 5), {
    image_url: "https://img", prompt: "Subtle natural motion, slow cinematic camera move", duration: "5", resolution: "480p",
  });
});

test("enviarAFal: el error dice el motivo probable (clave, saldo, parámetros) y el detalle de fal", async () => {
  const con = (status: number, cuerpo: unknown) => (async () => Response.json(cuerpo, { status })) as typeof fetch;
  const pedir = (f: typeof fetch) => enviarAFal("fal-ai/m", { image_url: "u", prompt: "p" }, "https://w", f, "k");
  await assert.rejects(pedir(con(401, { detail: "Invalid key" })), /\(401\): la clave FAL_KEY no es válida/);
  await assert.rejects(pedir(con(403, { detail: "User is locked. Reason: Exhausted balance." })), /\(403\): falta saldo en fal\.ai o la cuenta está bloqueada · User is locked\. Reason: Exhausted balance\./);
  await assert.rejects(pedir(con(422, { detail: [{ msg: "field required", loc: ["body", "prompt"] }] })), /\(422\): fal\.ai no aceptó la foto o los parámetros del modelo/);
  await assert.rejects(pedir(con(500, "x")), /\(500\)/);
});
