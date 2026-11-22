import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAVE_APP_PLAY, esAppPlay, INICIO_APP_PLAY } from "./app-play";

const nada = { referrer: "", search: "", guardado: null };

test("esAppPlay: abierta desde la app de Android (el teléfono lo dice en el origen)", () => {
  assert.equal(esAppPlay({ ...nada, referrer: "android-app://app.netlify.innovationtech_studio.twa/" }), true);
  assert.equal(esAppPlay({ ...nada, referrer: "android-app://com.otra.app" }), true);
});

test("esAppPlay: abierta con la dirección de inicio que lleva el paquete de la tienda", () => {
  assert.equal(esAppPlay({ ...nada, search: "?app=play" }), true);
  assert.equal(esAppPlay({ ...nada, search: "?paquete=ok&app=play" }), true);
  assert.equal(INICIO_APP_PLAY, "/?app=play");
});

test("esAppPlay: se recuerda mientras dure esa sesión de la app (al navegar ya no viene el origen)", () => {
  assert.equal(esAppPlay({ ...nada, guardado: "1" }), true);
  assert.equal(CLAVE_APP_PLAY, "its-app-play");
});

test("esAppPlay: en el navegador o instalada desde el navegador NO es la app de la tienda", () => {
  assert.equal(esAppPlay(nada), false);
  assert.equal(esAppPlay({ ...nada, referrer: "https://www.google.com/" }), false);
  assert.equal(esAppPlay({ ...nada, referrer: "https://innovationtech-studio.netlify.app/" }), false);
  assert.equal(esAppPlay({ ...nada, search: "?app=web" }), false);
  assert.equal(esAppPlay({ ...nada, search: "?aplicacion=play" }), false);
  assert.equal(esAppPlay({ ...nada, guardado: "0" }), false);
});

test("esAppPlay: datos raros no la rompen", () => {
  assert.equal(esAppPlay({ referrer: "android-app:", search: "??", guardado: "" }), false);
  assert.equal(esAppPlay({ referrer: " ANDROID-APP://x", search: "", guardado: null }), false);
});

// ---------- El guion que corre antes de pintar la página ----------
import { GUION_APP_PLAY } from "./app-play";

function correr(o: { referrer: string; search: string; guardado: string | null; sinAlmacen?: boolean }) {
  const guardados = new Map<string, string>();
  if (o.guardado !== null) guardados.set(CLAVE_APP_PLAY, o.guardado);
  const dataset: Record<string, string> = {};
  const sessionStorage = {
    getItem: (k: string) => {
      if (o.sinAlmacen) throw new Error("bloqueado");
      return guardados.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (o.sinAlmacen) throw new Error("bloqueado");
      guardados.set(k, v);
    },
  };
  new Function("document", "location", "sessionStorage", GUION_APP_PLAY)(
    { referrer: o.referrer, documentElement: { dataset } },
    { search: o.search },
    sessionStorage,
  );
  return { marca: dataset.appPlay, guardado: guardados.get(CLAVE_APP_PLAY) };
}

test("el guion marca la página y lo recuerda en la sesión cuando viene de la app de la tienda", () => {
  assert.deepEqual(correr({ referrer: "android-app://app.x.twa/", search: "", guardado: null }), { marca: "1", guardado: "1" });
  assert.deepEqual(correr({ referrer: "", search: "?app=play", guardado: null }), { marca: "1", guardado: "1" });
  assert.deepEqual(correr({ referrer: "", search: "", guardado: "1" }), { marca: "1", guardado: "1" });
});

test("el guion no marca nada en el navegador", () => {
  assert.deepEqual(correr({ referrer: "https://www.google.com/", search: "?x=1", guardado: null }), { marca: undefined, guardado: undefined });
});

test("el guion decide igual que esAppPlay en todos los casos", () => {
  const casos = [
    { referrer: "", search: "", guardado: null },
    { referrer: "android-app://a.b", search: "", guardado: null },
    { referrer: "android-app://", search: "", guardado: null },
    { referrer: "", search: "?app=play", guardado: null },
    { referrer: "", search: "?app=web", guardado: null },
    { referrer: "", search: "?a=1&app=play", guardado: null },
    { referrer: "", search: "", guardado: "1" },
    { referrer: "", search: "", guardado: "0" },
  ];
  for (const c of casos) assert.equal(correr(c).marca === "1", esAppPlay(c), JSON.stringify(c));
});

test("el guion no truena si el navegador bloquea el almacenamiento (igual marca la página)", () => {
  assert.equal(correr({ referrer: "android-app://a.b", search: "", guardado: null, sinAlmacen: true }).marca, "1");
});
