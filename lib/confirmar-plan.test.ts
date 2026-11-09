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

/* ---------------- Pasar de pago a mano a tarjeta ---------------- */

test("pasar a tarjeta: mensaje con el precio y la fecha del primer cobro (hora de Chicago)", async () => {
  const { confirmacionPasarATarjeta } = await import("./confirmar-plan");
  // 05:59:59 UTC del 9 de diciembre = 23:59:59 del 8 de diciembre en Chicago
  assert.deepEqual(confirmacionPasarATarjeta({ fecha: Date.parse("2026-12-09T05:59:59Z"), precio: 19 }), {
    mensaje:
      "Vas a pasar a pago con tarjeta. Hoy no se te cobra nada: tu primer cobro de $19 será el 8 de diciembre, cuando termina lo que pagaste a mano. ¿Continuar?",
    boton: "Sí, pasar a tarjeta",
  });
});

test("pasar a tarjeta: sin la opción no hay nada que confirmar", async () => {
  const { confirmacionPasarATarjeta } = await import("./confirmar-plan");
  assert.equal(confirmacionPasarATarjeta(null), null);
});

test("pasar a tarjeta: el mensaje y los avisos del servidor tienen traducción al inglés", async () => {
  const { confirmacionPasarATarjeta } = await import("./confirmar-plan");
  const { EN, EN_PATTERNS } = await import("./locales/en");
  const traducir = (s: string) => {
    if (EN[s]) return EN[s];
    for (const [re, out] of EN_PATTERNS) if (re.test(s)) return s.replace(re, out);
    return s;
  };
  const c = confirmacionPasarATarjeta({ fecha: Date.parse("2026-12-09T05:59:59Z"), precio: 39 })!;
  assert.equal(
    traducir(c.mensaje),
    "You're switching to card payment. You won't be charged anything today: your first charge of $39 will be on 8 de diciembre, when what you paid by hand ends. Continue?",
  );
  assert.equal(traducir(c.boton), "Yes, switch to card");
  assert.equal(traducir("Pasar a tarjeta"), "Switch to card");
  assert.match(traducir("Tu plan está pagado a mano hasta el 8 de diciembre. Ese día podrás poner tu tarjeta."), /^Your plan is paid by hand until 8 de diciembre\./);
  assert.match(traducir("Tu plan está pagado a mano hasta 8 de diciembre de 2026. Para cambiar de plan, escríbenos."), /^Your plan is paid by hand until 8 de diciembre de 2026\. To change plans, write to us\.$/);
  assert.match(traducir("Tu plan está pagado a mano hasta 8 de diciembre de 2026. Escríbenos si quieres pasarte a tarjeta."), /^Your plan is paid by hand until/);
});
