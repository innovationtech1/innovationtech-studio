import { test } from "node:test";
import assert from "node:assert/strict";
import { esRutaPublica } from "./rutas-publicas";

test("los Términos y la Privacidad se abren sin iniciar sesión", () => {
  for (const r of ["/terminos", "/privacidad", "/terminos/", "/privacidad/"]) assert.equal(esRutaPublica(r), true, r);
});

test("el resto de la app sigue detrás de la cuenta", () => {
  for (const r of ["/", "/admin", "/terminosx", "/privacidad/otra", "", null, undefined]) assert.equal(esRutaPublica(r), false, String(r));
});
