import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { colecciones, prefijoColecciones } from "./colecciones";

const antes = process.env.STUDIO_COLECCION_PREFIJO;
afterEach(() => {
  if (antes === undefined) delete process.env.STUDIO_COLECCION_PREFIJO;
  else process.env.STUDIO_COLECCION_PREFIJO = antes;
});

test("colecciones: sin prefijo, los nombres de siempre", () => {
  delete process.env.STUDIO_COLECCION_PREFIJO;
  assert.equal(prefijoColecciones(), "studio_");
  assert.deepEqual(colecciones(), {
    usuarios: "studio_usuarios",
    negocios: "studio_negocios",
    uso: "studio_uso",
    invitaciones: "studio_invitaciones",
    config: "studio_config",
    pagosManuales: "studio_pagos_manuales",
    stripeEventos: "studio_stripe_eventos",
    movimientosPaquetes: "studio_paquetes_movimientos",
  });
});

test("colecciones: con prefijo de pruebas, todas cambian", () => {
  process.env.STUDIO_COLECCION_PREFIJO = "prueba_studio_";
  const c = colecciones();
  assert.equal(c.negocios, "prueba_studio_negocios");
  assert.equal(c.stripeEventos, "prueba_studio_stripe_eventos");
  assert.equal(c.movimientosPaquetes, "prueba_studio_paquetes_movimientos");
  for (const nombre of Object.values(c)) assert.ok(nombre.startsWith("prueba_studio_"));
});

test("colecciones: prefijo vacío o inválido usa studio_", () => {
  process.env.STUDIO_COLECCION_PREFIJO = "  ";
  assert.equal(prefijoColecciones(), "studio_");
  process.env.STUDIO_COLECCION_PREFIJO = "a/b";
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(prefijoColecciones(), "studio_");
  } finally {
    console.warn = original;
  }
});
