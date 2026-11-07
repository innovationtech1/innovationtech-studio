import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_DURA, configConCache, olvidarConfig } from "./account-store";
import { mezclarConfig } from "./plans";

beforeEach(() => olvidarConfig());

test("configConCache: lee una vez y reutiliza durante 60 s", async () => {
  let lecturas = 0;
  const leer = async () => (lecturas++, mezclarConfig({ pruebaMinutos: 20 }));
  const t = 1_000_000;
  assert.equal((await configConCache("studio_config", leer, t)).pruebaMinutos, 20);
  await configConCache("studio_config", leer, t + CONFIG_DURA - 1);
  assert.equal(lecturas, 1);
  await configConCache("studio_config", leer, t + CONFIG_DURA);
  assert.equal(lecturas, 2);
});

test("configConCache: devuelve copias (nadie modifica lo guardado)", async () => {
  const leer = async () => mezclarConfig(null);
  const a = await configConCache("studio_config", leer, 0);
  a.pruebaMinutos = 999;
  assert.equal((await configConCache("studio_config", leer, 1)).pruebaMinutos, 10);
});

test("configConCache: olvidarConfig obliga a leer de nuevo; otra colección no comparte", async () => {
  let lecturas = 0;
  const leer = async () => (lecturas++, mezclarConfig(null));
  await configConCache("studio_config", leer, 0);
  olvidarConfig();
  await configConCache("studio_config", leer, 1);
  await configConCache("prueba_studio_config", leer, 2);
  assert.equal(lecturas, 3);
});
