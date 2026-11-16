import { test } from "node:test";
import assert from "node:assert/strict";
import { compartirArchivos, aArchivo } from "./compartir";

const archivo = () => new File([new Uint8Array([1, 2, 3])], "reel.mp4", { type: "video/mp4" });

test("compartirArchivos comparte cuando el navegador puede", async () => {
  let recibido: ShareData | undefined;
  const nav = {
    canShare: () => true,
    share: async (d: ShareData) => {
      recibido = d;
    },
  };
  const r = await compartirArchivos([archivo()], "Hola", nav);
  assert.equal(r, "compartido");
  assert.equal(recibido?.files?.length, 1);
  assert.equal(recibido?.text, "Hola");
});

test("compartirArchivos: cancelar no es error", async () => {
  const nav = {
    canShare: () => true,
    share: async () => {
      throw Object.assign(new Error("x"), { name: "AbortError" });
    },
  };
  assert.equal(await compartirArchivos([archivo()], undefined, nav), "cancelado");
});

test("compartirArchivos sin canShare o con canShare falso → descargar", async () => {
  let llamado = false;
  const share = async () => {
    llamado = true;
  };
  assert.equal(await compartirArchivos([archivo()], "Hola", { share }), "descargar");
  assert.equal(await compartirArchivos([archivo()], "Hola", { share, canShare: () => false }), "descargar");
  assert.equal(llamado, false);
});

test("compartirArchivos: otro error → descargar", async () => {
  const nav = {
    canShare: () => true,
    share: async () => {
      throw Object.assign(new Error("no"), { name: "NotAllowedError" });
    },
  };
  assert.equal(await compartirArchivos([archivo()], undefined, nav), "descargar");
});

test("aArchivo con Blob conserva tipo y nombre", async () => {
  const f = await aArchivo(new Blob([new Uint8Array([1])], { type: "video/mp4" }), "reel.mp4");
  assert.ok(f);
  assert.equal(f.type, "video/mp4");
  assert.equal(f.name, "reel.mp4");
});

test("aArchivo con URL usa fetch y conserva el tipo", async () => {
  const f = (async () => new Response(new Blob([new Uint8Array([1, 2])], { type: "image/png" }))) as unknown as typeof fetch;
  const r = await aArchivo("https://ejemplo.com/a.png", "a.png", f);
  assert.ok(r);
  assert.equal(r.name, "a.png");
  assert.equal(r.type, "image/png");
  assert.equal(r.size, 2);
});

test("aArchivo con fetch que falla devuelve null", async () => {
  const rechaza = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  assert.equal(await aArchivo("https://ejemplo.com/v.mp4", "v.mp4", rechaza), null);
  const noOk = (async () => new Response("x", { status: 403 })) as unknown as typeof fetch;
  assert.equal(await aArchivo("https://ejemplo.com/v.mp4", "v.mp4", noOk), null);
});
