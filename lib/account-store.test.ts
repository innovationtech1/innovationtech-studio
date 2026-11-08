import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_DURA, configConCache, olvidarConfig } from "./account-store";
import { mezclarConfig, type Negocio } from "./plans";
import { memoryStore } from "./account-store-memory";
import type { MovimientoPaquete } from "./account-store";

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

const MES = "2026-11";
function neg(paquetes?: Negocio["paquetes"]): Negocio {
  return {
    id: "n1",
    nombre: "Tortas de prueba",
    duenoUid: "u1",
    miembros: ["u1"],
    plan: "basico",
    estado: "activo",
    origen: "manual",
    ...(paquetes ? { paquetes } : {}),
    creado: 0,
    actualizado: 0,
  };
}

test("reservarUso: gasta primero lo del mes y después el saldo", async () => {
  const store = memoryStore({ negocios: [neg({ textos: 1 })] });
  assert.deepEqual(await store.reservarUso("n1", MES, "textos", 1, 2), { delMes: 1, delSaldo: 0 });
  assert.deepEqual(await store.reservarUso("n1", MES, "textos", 1, 2), { delMes: 1, delSaldo: 0 });
  assert.deepEqual(await store.reservarUso("n1", MES, "textos", 1, 2), { delMes: 0, delSaldo: 1 });
  assert.equal(await store.reservarUso("n1", MES, "textos", 1, 2), null);
  assert.deepEqual((await store.getNegocio("n1"))?.paquetes, {});
  assert.equal(store.uso("n1", MES).textos, 2);
});

test("reservarUso: si el negocio no existe devuelve null", async () => {
  const store = memoryStore();
  assert.equal(await store.reservarUso("nada", MES, "textos", 1, 5), null);
});

test("reservarUso: dos en paralelo con tope 1 y sin saldo → solo una pasa", async () => {
  const store = memoryStore({ negocios: [neg()] });
  const r = await Promise.all([
    store.reservarUso("n1", MES, "imagenes", 1, 1),
    store.reservarUso("n1", MES, "imagenes", 1, 1),
  ]);
  assert.equal(r.filter((x) => x !== null).length, 1);
});

test("devolverUso: regresa cada parte a su lugar", async () => {
  const store = memoryStore({ negocios: [neg({ voces: 1 })], uso: { [`n1_${MES}`]: { voces: 5 } } });
  await store.devolverUso("n1", MES, "voces", { delMes: 1, delSaldo: 2 });
  assert.equal(store.uso("n1", MES).voces, 4);
  assert.deepEqual((await store.getNegocio("n1"))?.paquetes, { voces: 3 });
});

test("devolverUso: el contador nunca baja de 0", async () => {
  const store = memoryStore({ negocios: [neg()] });
  await store.devolverUso("n1", MES, "voces", { delMes: 5, delSaldo: 0 });
  assert.equal(store.uso("n1", MES).voces, 0);
});

test("listarMovimientos: solo los del negocio, del más nuevo al más viejo", async () => {
  const store = memoryStore();
  const m = (id: string, negocioId: string, fecha: number): MovimientoPaquete => ({
    id,
    negocioId,
    tipo: "agregar",
    cantidades: { textos: 5 },
    registradoPor: "a@b.com",
    fecha,
  });
  await store.registrarMovimiento(m("a", "n1", 10));
  await store.registrarMovimiento(m("b", "n2", 20));
  await store.registrarMovimiento(m("c", "n1", 30));
  assert.deepEqual((await store.listarMovimientos("n1")).map((x) => x.id), ["c", "a"]);
});
