import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudflareImage } from "./cloudflare";

const FOTO = "data:image/jpeg;base64," + Buffer.from("foto").toString("base64");

test("cloudflareImage: con «size» pide ese tamaño exacto al modelo de referencias y manda la foto", async (t) => {
  const vistos: { url: string; form: FormData }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    vistos.push({ url: String(url), form: init.body as FormData });
    return new Response(JSON.stringify({ success: true, result: { image: "QUJD" } }), { headers: { "content-type": "application/json" } });
  });
  const out = await cloudflareImage({ accountId: "acc", token: "tok", model: "m-texto", refModel: "m-ref", prompt: "quita el vaso", aspectRatio: "1:1", references: [FOTO], size: [1344, 1008] });
  assert.equal(out, "data:image/jpeg;base64,QUJD");
  assert.equal(vistos.length, 1);
  assert.match(vistos[0].url, /m-ref$/);
  assert.equal(vistos[0].form.get("width"), "1344");
  assert.equal(vistos[0].form.get("height"), "1008");
  assert.ok(vistos[0].form.get("input_image_0"));
});

test("cloudflareImage: sin «size» sigue usando el tamaño del formato", async (t) => {
  let form: FormData | null = null;
  t.mock.method(globalThis, "fetch", async (_u: string, init: RequestInit) => {
    form = init.body as FormData;
    return new Response(JSON.stringify({ success: true, result: { image: "QUJD" } }), { headers: { "content-type": "application/json" } });
  });
  await cloudflareImage({ accountId: "a", token: "t", model: "m", refModel: "r", prompt: "x", aspectRatio: "9:16", references: [] });
  assert.equal(form!.get("width"), "768");
  assert.equal(form!.get("height"), "1344");
});
