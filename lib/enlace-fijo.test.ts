import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoFijo, direccionFija } from "./enlace-fijo";

const TEMPORAL = "6912a4b0c3d2e1f0a9b8c7d6--innovationtech-studio.netlify.app";

test("direccionFija: en producción es la dirección del sitio; en una rama, la de la rama", () => {
  assert.equal(direccionFija({ CONTEXT: "production", URL: "https://innovationtech-studio.netlify.app" }), "https://innovationtech-studio.netlify.app");
  assert.equal(
    direccionFija({ CONTEXT: "branch-deploy", URL: "https://innovationtech-studio.netlify.app", DEPLOY_PRIME_URL: "https://pruebas--innovationtech-studio.netlify.app" }),
    "https://pruebas--innovationtech-studio.netlify.app",
  );
});

test("direccionFija: fuera de Netlify o en vistas previas de una solicitud no hay a dónde mandar", () => {
  assert.equal(direccionFija({}), "");
  assert.equal(direccionFija({ CONTEXT: "deploy-preview", DEPLOY_PRIME_URL: "https://deploy-preview-10--innovationtech-studio.netlify.app" }), "");
});

test("destinoFijo: un enlace temporal manda a la dirección fija conservando la página", () => {
  assert.equal(
    destinoFijo({ host: TEMPORAL, pathname: "/admin", search: "?a=1", hash: "#x" }, "https://pruebas--innovationtech-studio.netlify.app"),
    "https://pruebas--innovationtech-studio.netlify.app/admin?a=1#x",
  );
});

test("destinoFijo: la dirección fija, la de pruebas y localhost se quedan donde están", () => {
  const fija = "https://pruebas--innovationtech-studio.netlify.app";
  for (const host of ["pruebas--innovationtech-studio.netlify.app", "innovationtech-studio.netlify.app", "localhost:3000", "studio.midominio.com"]) {
    assert.equal(destinoFijo({ host, pathname: "/", search: "", hash: "" }, fija), null, host);
  }
});

test("destinoFijo: sin dirección fija (o con una inválida) no se mueve a nadie", () => {
  assert.equal(destinoFijo({ host: TEMPORAL, pathname: "/", search: "", hash: "" }, ""), null);
  assert.equal(destinoFijo({ host: TEMPORAL, pathname: "/", search: "", hash: "" }, "no es una dirección"), null);
});

test("destinoFijo: nunca manda a otro sitio que no sea el mismo de Netlify", () => {
  assert.equal(destinoFijo({ host: TEMPORAL, pathname: "/", search: "", hash: "" }, "https://otro-sitio.netlify.app"), null);
});
