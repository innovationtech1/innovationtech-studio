// Mensajes claros en español para los errores de inicio de sesión de Firebase.
// Devuelve "" cuando no hay que mostrar nada (por ejemplo, la persona cerró la ventana de Google).

const MENSAJES: Record<string, string> = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/email-already-in-use": "Ese correo ya tiene cuenta. Inicia sesión.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/invalid-email": "Escribe un correo válido.",
  "auth/missing-email": "Escribe un correo válido.",
  "auth/missing-password": "Escribe tu contraseña.",
  "auth/network-request-failed": "Revisa tu conexión a internet.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
  "auth/popup-closed-by-user": "",
  "auth/cancelled-popup-request": "",
  "auth/user-cancelled": "",
};

export function mensajeAuth(e: unknown): string {
  const codigo = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  if (codigo in MENSAJES) return MENSAJES[codigo];
  return "No se pudo iniciar sesión. Intenta de nuevo.";
}

// «Reenviar correo» (confirmar el correo): aviso cuando se envió y mensajes de error propios,
// porque los de inicio de sesión no aplican aquí.
export const REENVIO_OK = "Te enviamos otro enlace. Revisa también Spam.";

export function mensajeReenvio(e: unknown): string {
  const codigo = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  if (codigo === "auth/too-many-requests") return "Espera unos minutos antes de pedir otro correo.";
  if (codigo === "auth/network-request-failed") return MENSAJES[codigo];
  return "No pudimos enviar el correo. Intenta de nuevo.";
}
