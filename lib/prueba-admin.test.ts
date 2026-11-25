import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./account-store-memory";
import { ajustarPrueba, DIAS_PRUEBA, diasDePrueba, TITULO_SIN_PLAN_PLAY } from "./prueba-admin";

const ADMIN = "dueno@ejemplo.com";

async function conAdmin<T>(fn: () => Promise<T>): Promise<T> {
  const antes = process.env.STUDIO_ADMIN_EMAILS;
  process.env.STUDIO_ADMIN_EMAILS = ADMIN;
  try {
    return await fn();
  } finally {
    if (antes === undefined) delete process.env.STUDIO_ADMIN_EMAILS;
    else process.env.STUDIO_ADMIN_EMAILS = antes;
  }
}

test("DIAS_PRUEBA: las únicas duraciones que ofrece el panel son 7, 15 y 30 días", () => {
  assert.deepEqual([...DIAS_PRUEBA], [7, 15, 30]);
});

test("diasDePrueba: traduce los minutos guardados a días, o null si no es una de las opciones", () => {
  assert.equal(diasDePrueba(7 * 1440), 7);
  assert.equal(diasDePrueba(15 * 1440), 15);
  assert.equal(diasDePrueba(30 * 1440), 30);
  assert.equal(diasDePrueba(10), null); // los 10 minutos de fábrica
  assert.equal(diasDePrueba(8 * 1440), null);
});

test("ajustarPrueba: el administrador elige 30 días y se guarda en minutos sin tocar lo demás", async () => {
  await conAdmin(async () => {
    const store = memoryStore({});
    const antes = await store.getConfig();
    assert.deepEqual(await ajustarPrueba(ADMIN, true, { dias: 30 }, { store }), { ok: true, dias: 30 });
    const cfg = await store.getConfig();
    assert.equal(cfg.pruebaMinutos, 30 * 1440);
    assert.deepEqual(cfg.limitesMes, antes.limitesMes);
    assert.equal(cfg.impuestos, antes.impuestos);
    assert.deepEqual(await ajustarPrueba(ADMIN, true, { dias: 7 }, { store }), { ok: true, dias: 7 });
    assert.equal((await store.getConfig()).pruebaMinutos, 7 * 1440);
  });
});

test("ajustarPrueba: quien no es administrador (o no verificó su correo) no cambia nada", async () => {
  await conAdmin(async () => {
    const store = memoryStore({});
    const antes = (await store.getConfig()).pruebaMinutos;
    for (const [correo, verificado] of [["otro@x.com", true], [ADMIN, false]] as const) {
      const r = await ajustarPrueba(correo, verificado, { dias: 30 }, { store });
      assert.ok(!r.ok);
      assert.equal(r.status, 403);
    }
    assert.equal((await store.getConfig()).pruebaMinutos, antes);
  });
});

test("ajustarPrueba: rechaza cualquier duración que no sea 7, 15 o 30 días", async () => {
  await conAdmin(async () => {
    const store = memoryStore({});
    const antes = (await store.getConfig()).pruebaMinutos;
    for (const malo of [{}, null, { dias: 0 }, { dias: 8 }, { dias: 365 }, { dias: "30" }, { dias: -7 }, { dias: 7.5 }]) {
      const r = await ajustarPrueba(ADMIN, true, malo, { store });
      assert.ok(!r.ok, JSON.stringify(malo));
      assert.equal(r.status, 400);
    }
    assert.equal((await store.getConfig()).pruebaMinutos, antes);
  });
});

test("TITULO_SIN_PLAN_PLAY: en la app de Google Play la pantalla sin plan no invita a elegir ni a comprar", () => {
  assert.equal(TITULO_SIN_PLAN_PLAY, "Tu prueba terminó");
  assert.doesNotMatch(TITULO_SIN_PLAN_PLAY, /elige|plan|compra|precio/i);
});
