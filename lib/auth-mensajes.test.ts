import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeAuth } from "./auth-mensajes";

const err = (code: string) => Object.assign(new Error("x"), { code });

test("traduce los errores comunes de Firebase", () => {
  for (const c of ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"]) {
    assert.equal(mensajeAuth(err(c)), "Correo o contraseña incorrectos.");
  }
  assert.equal(mensajeAuth(err("auth/email-already-in-use")), "Ese correo ya tiene cuenta. Inicia sesión.");
  assert.equal(mensajeAuth(err("auth/weak-password")), "La contraseña debe tener al menos 6 caracteres.");
  assert.equal(mensajeAuth(err("auth/invalid-email")), "Escribe un correo válido.");
  assert.equal(mensajeAuth(err("auth/network-request-failed")), "Revisa tu conexión a internet.");
});

test("cerrar la ventana de Google no es un error", () => {
  assert.equal(mensajeAuth(err("auth/popup-closed-by-user")), "");
});

test("cualquier otro error da un mensaje general", () => {
  assert.equal(mensajeAuth(err("auth/algo-raro")), "No se pudo iniciar sesión. Intenta de nuevo.");
  assert.equal(mensajeAuth(null), "No se pudo iniciar sesión. Intenta de nuevo.");
});
