import { test } from "node:test";
import assert from "node:assert/strict";
import { resumenNegocios } from "./admin-resumen";

const precios = { basico: 19, pro: 39 };
const f = (estado: "prueba" | "activo" | "pausado" | "sin_plan", plan: string | null) => ({ efectivo: { estado, plan } });

test("resumenNegocios: sin negocios, todo en cero", () => {
  assert.deepEqual(resumenNegocios([], precios), { total: 0, activos: 0, prueba: 0, pausados: 0, ingresoMensual: 0 });
});

test("resumenNegocios: cuenta por estado y suma solo lo que pagan los activos", () => {
  const r = resumenNegocios([f("activo", "basico"), f("activo", "pro"), f("activo", "pro"), f("prueba", "prueba"), f("pausado", "pro"), f("sin_plan", null)], precios);
  assert.deepEqual(r, { total: 6, activos: 3, prueba: 1, pausados: 2, ingresoMensual: 97 });
});
