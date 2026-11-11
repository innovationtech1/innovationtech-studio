import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "./errors";

test("cuando el servidor corta la respuesta (página HTML en vez de datos), el mensaje es claro", () => {
  const esperado = "El servidor tardó demasiado en responder. Intenta de nuevo; si es la voz, prueba con un guion más corto.";
  assert.equal(friendlyError(`Unexpected token '<', "<HTML> <HE"... is not valid JSON`), esperado);
  assert.equal(friendlyError("JSON.parse: unexpected character at line 1 column 1 of the JSON data"), esperado);
  assert.equal(friendlyError("The string did not match the expected pattern."), esperado); // Safari
});

test("los demás mensajes pasan igual", () => {
  assert.equal(friendlyError("Escribe el guion de la voz en off."), "Escribe el guion de la voz en off.");
  assert.equal(friendlyError(""), "Algo salió mal. Intenta de nuevo.");
});
