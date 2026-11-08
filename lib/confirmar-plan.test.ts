import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmacionCambio, type DatosCambio } from "./confirmar-plan";

const PRECIOS = { basico: 19, pro: 39 };

// Negocio con suscripción de tarjeta viva en este modo
function con(plan: "basico" | "pro", extra: Partial<DatosCambio> = {}): DatosCambio {
  return {
    negocio: { origen: "stripe", stripe: { subscriptionId: "sub_1" } },
    efectivo: { estado: "activo", plan },
    precios: PRECIOS,
    ...extra,
  };
}

test("de Básico a Pro con suscripción viva: pide confirmar con el precio de Pro", () => {
  assert.deepEqual(confirmacionCambio(con("basico"), "pro"), {
    mensaje:
      "Vas a pasar al plan Pro ($39 al mes). Hoy se cobra solo la diferencia por los días que quedan de este mes, con tu tarjeta guardada. ¿Confirmas?",
    boton: "Sí, cambiar a Pro",
  });
});

test("de Pro a Básico con suscripción viva: avisa del crédito y del equipo", () => {
  assert.deepEqual(confirmacionCambio(con("pro"), "basico"), {
    mensaje:
      "Vas a pasar al plan Básico ($19 al mes). Lo que ya pagaste de Pro este mes queda como crédito para tus próximos cobros. Tu equipo dejará de poder usar Studio. ¿Confirmas?",
    boton: "Sí, cambiar a Básico",
  });
});

test("los montos salen de los precios de la cuenta", () => {
  const r = confirmacionCambio(con("basico", { precios: { basico: 25, pro: 49 } }), "pro");
  assert.match(r?.mensaje ?? "", /\(\$49 al mes\)/);
});

test("sin suscripción (primer pago): no pide confirmar", () => {
  assert.equal(confirmacionCambio(con("basico", { negocio: { origen: "stripe" } }), "pro"), null);
  assert.equal(confirmacionCambio(con("basico", { negocio: { origen: "stripe", stripe: {} } }), "pro"), null);
  assert.equal(
    confirmacionCambio({ negocio: { origen: null }, efectivo: { estado: "prueba", plan: "prueba" }, precios: PRECIOS }, "pro"),
    null,
  );
});

test("mismo plan: no pide confirmar", () => {
  assert.equal(confirmacionCambio(con("pro"), "pro"), null);
  assert.equal(confirmacionCambio(con("basico"), "basico"), null);
});

test("pago manual: no pide confirmar", () => {
  const manual = con("basico", { negocio: { origen: "manual", stripe: { subscriptionId: "sub_1" } } });
  assert.equal(confirmacionCambio(manual, "pro"), null);
});

test("pausado o sin plan (abre el portal o paga de nuevo): no pide confirmar", () => {
  assert.equal(confirmacionCambio(con("basico", { efectivo: { estado: "pausado", plan: "basico" } }), "pro"), null);
  assert.equal(confirmacionCambio(con("basico", { efectivo: { estado: "sin_plan", plan: null } }), "pro"), null);
});

test("los dos mensajes tienen traducción al inglés con el monto", async () => {
  const { EN_PATTERNS } = await import("./locales/en");
  const traducir = (s: string) => {
    for (const [re, out] of EN_PATTERNS) if (re.test(s)) return s.replace(re, out);
    return s;
  };
  assert.match(traducir(confirmacionCambio(con("basico"), "pro")!.mensaje), /^You're switching to the Pro plan \(\$39 per month\)/);
  assert.match(traducir(confirmacionCambio(con("pro"), "basico")!.mensaje), /^You're switching to the Basic plan \(\$19 per month\)/);
});
