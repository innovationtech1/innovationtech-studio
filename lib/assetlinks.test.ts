import { test } from "node:test";
import assert from "node:assert/strict";
import { enlacesDeApp } from "./assetlinks";

const huella = Array.from({ length: 32 }, (_, i) => (i + 16).toString(16).toUpperCase()).join(":");

test("enlacesDeApp: sin configurar devuelve una lista vacía", () => {
  assert.deepEqual(enlacesDeApp(undefined, undefined), []);
  assert.deepEqual(enlacesDeApp("app.ejemplo.studio", ""), []);
  assert.deepEqual(enlacesDeApp("", huella), []);
});

test("enlacesDeApp: con paquete y huella arma el enlace que pide Google", () => {
  const r = enlacesDeApp(" app.ejemplo.studio ", ` ${huella.toLowerCase()} `);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(r[0].target.package_name, "app.ejemplo.studio");
  assert.deepEqual(r[0].target.sha256_cert_fingerprints, [huella]);
});

test("enlacesDeApp: acepta varias huellas y descarta las mal escritas y las repetidas", () => {
  const otra = huella.replace(/^10/, "AB");
  const r = enlacesDeApp("app.ejemplo.studio", `${huella}, no-es-huella, ${otra}, ${huella}`);
  assert.deepEqual(r[0].target.sha256_cert_fingerprints, [huella, otra]);
});

test("enlacesDeApp: un nombre de paquete mal escrito no publica nada", () => {
  assert.deepEqual(enlacesDeApp("Studio", huella), []);
  assert.deepEqual(enlacesDeApp("app..studio", huella), []);
});
