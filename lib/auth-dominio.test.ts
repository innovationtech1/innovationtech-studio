import { test } from "node:test";
import assert from "node:assert/strict";
import { dominioDeAuth, reescriturasDeAuth } from "./auth-dominio";

test("dominioDeAuth: en el sitio publicado, el inicio de sesión pasa por la misma dirección de Studio", () => {
  const firebase = "innovationtech-x.firebaseapp.com";
  assert.equal(dominioDeAuth("https:", "innovationtech-studio.netlify.app", firebase), "innovationtech-studio.netlify.app");
  assert.equal(dominioDeAuth("https:", "pruebas--innovationtech-studio.netlify.app", firebase), "pruebas--innovationtech-studio.netlify.app");
  // En la computadora (localhost) o sin navegador se queda el de Firebase
  assert.equal(dominioDeAuth("http:", "localhost:3000", firebase), firebase);
  assert.equal(dominioDeAuth(undefined, undefined, firebase), firebase);
});

test("reescriturasDeAuth: /__/auth y /__/firebase se sirven desde Firebase; sin dominio configurado, ninguna", () => {
  assert.deepEqual(reescriturasDeAuth("innovationtech-x.firebaseapp.com"), [
    { source: "/__/auth/:ruta*", destination: "https://innovationtech-x.firebaseapp.com/__/auth/:ruta*" },
    { source: "/__/firebase/:ruta*", destination: "https://innovationtech-x.firebaseapp.com/__/firebase/:ruta*" },
  ]);
  assert.deepEqual(reescriturasDeAuth(""), []);
  assert.deepEqual(reescriturasDeAuth(undefined), []);
  // Un valor raro no se convierte en una dirección
  assert.deepEqual(reescriturasDeAuth("malo.com/x?y"), []);
});
