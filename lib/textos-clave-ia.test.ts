import { test } from "node:test";
import assert from "node:assert/strict";
import { EN, EN_PATTERNS } from "./locales/en";

// Textos nuevos de «conectar Cloudflare en la cuenta» (pantallas y mensajes de /api/cuenta/clave-ia):
// todos deben tener su traducción al inglés.
const traducir = (s: string) => {
  if (EN[s]) return EN[s];
  for (const [re, out] of EN_PATTERNS) if (re.test(s)) return s.replace(re, out);
  return null;
};

const TEXTOS = [
  "Tu cuenta de Cloudflare (opcional)",
  "Conéctala para usar Studio sin los límites del mes. Es gratis en Cloudflare.",
  "Conectar Cloudflare",
  "Conectada (cuenta …a1b2) · Sin límites del mes",
  "Desconectar",
  "Desconectar Cloudflare",
  "Sí, desconectar",
  "Desconectando…",
  "¿Desconectar tu cuenta de Cloudflare? Studio volverá a usar la IA de InnovationTECH con los límites de tu plan.",
  "Tu Cloudflare conectado ya no se puede leer. Conéctalo otra vez.",
  "Tu negocio usa su propia cuenta de Cloudflare.",
  "Este dispositivo tiene guardada una clave de Cloudflare. Guárdala en tu cuenta para que la use todo tu equipo.",
  "Guardar en tu cuenta",
  "Guardando…",
  "Cerrar asistente",
  "El token es como una contraseña: no lo compartas con nadie. Se guarda cifrado en tu cuenta y lo usa todo tu equipo.",
  "Ya puedes usar Studio sin los límites del mes. Lo usa todo tu equipo.",
  "Probando y guardando en tu cuenta…",
  "No se pudo guardar. Revisa tu internet.",
  // Mensajes de /api/cuenta/clave-ia
  "La clave no pasó la prueba.",
  "Escribe tu Account ID y tu token de Cloudflare.",
  "Solo el dueño del negocio puede conectar la cuenta de Cloudflare.",
  "Solo el dueño del negocio puede desconectar la cuenta de Cloudflare.",
  "Falta configurar el guardado seguro de claves. Avísale a InnovationTECH.",
];

test("clave de Cloudflare en la cuenta: todos los textos nuevos tienen inglés", () => {
  const faltan = TEXTOS.filter((t) => !traducir(t));
  assert.deepEqual(faltan, []);
});

test("clave de Cloudflare en la cuenta: «Conectada (cuenta …)» conserva los últimos 4", () => {
  assert.equal(traducir("Conectada (cuenta …9f3c) · Sin límites del mes"), "Connected (account …9f3c) · No monthly limits");
});
