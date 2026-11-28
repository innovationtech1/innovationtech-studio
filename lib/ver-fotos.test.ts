import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BYTES_FOTO_VER,
  MAX_DESCRIPCION,
  MAX_FOTOS_VER,
  MODELO_VISION,
  cuerpoVision,
  instruccionesVer,
  leerVision,
  limpiarDescripcion,
  validarFotos,
  verLote,
} from "./ver-fotos";

const foto = (n = 100, tipo = "jpeg") => `data:image/${tipo};base64,${"A".repeat(n)}`;

test("validarFotos: acepta de 1 a 8 fotos JPEG, PNG o WebP en data URL", () => {
  assert.deepEqual(validarFotos({ fotos: [foto(), foto(50, "png"), foto(50, "webp")] }), { ok: true, fotos: [foto(), foto(50, "png"), foto(50, "webp")] });
  assert.equal(validarFotos({ fotos: Array.from({ length: MAX_FOTOS_VER }, () => foto()) }).ok, true);
});

test("validarFotos: rechaza con motivo lo que no es una lista de fotos válidas", () => {
  const error = (c: unknown) => {
    const r = validarFotos(c);
    return r.ok ? "" : r.error;
  };
  assert.equal(error(null), "Falta la foto.");
  assert.equal(error({}), "Falta la foto.");
  assert.equal(error({ fotos: [] }), "Falta la foto.");
  assert.equal(error({ fotos: Array.from({ length: MAX_FOTOS_VER + 1 }, () => foto()) }), `Son demasiadas fotos: el máximo es ${MAX_FOTOS_VER}.`);
  assert.equal(error({ fotos: ["https://ejemplo.com/a.jpg"] }), "Una de las fotos no se puede leer.");
  assert.equal(error({ fotos: [foto(100, "gif")] }), "Una de las fotos no se puede leer.");
  assert.equal(error({ fotos: [5] }), "Una de las fotos no se puede leer.");
  assert.equal(error({ fotos: ["data:image/jpeg;base64,"] }), "Una de las fotos no se puede leer.");
  assert.equal(error({ fotos: [foto(Math.ceil((MAX_BYTES_FOTO_VER * 4) / 3) + 100)] }), "Una de las fotos pesa demasiado.");
});

test("instruccionesVer: pide una frase corta en español y prohíbe identificar personas", () => {
  const t = instruccionesVer();
  assert.match(t, /español/);
  assert.match(t, /15 palabras/);
  assert.match(t, /no identifiques/i);
  assert.match(t, /nombre|edad/);
});

test("cuerpoVision: la foto va en el campo image y la instrucción en los mensajes", () => {
  const c = cuerpoVision(foto());
  assert.equal(c.image, foto());
  assert.equal(c.messages[0].role, "system");
  assert.equal(c.messages[0].content, instruccionesVer());
  assert.equal(c.messages[1].role, "user");
  assert.ok(c.max_tokens <= 80);
  assert.equal(MODELO_VISION, "@cf/meta/llama-3.2-11b-vision-instruct");
});

test("leerVision: saca el texto de las dos formas en que responde Cloudflare", () => {
  assert.equal(leerVision({ result: { response: "Una torta" } }), "Una torta");
  assert.equal(leerVision({ result: { choices: [{ message: { content: "Un local" } }] } }), "Un local");
  assert.equal(leerVision({ result: {} }), "");
  assert.equal(leerVision(null), "");
});

test("limpiarDescripcion: una línea, sin comillas ni muletillas, con tope de largo", () => {
  assert.equal(limpiarDescripcion('"Una torta cubana sobre una mesa de madera."'), "Una torta cubana sobre una mesa de madera");
  assert.equal(limpiarDescripcion("En la imagen se ve una torta\ncon papas"), "Una torta con papas");
  assert.equal(limpiarDescripcion("La imagen muestra un local con letrero rojo."), "Un local con letrero rojo");
  assert.equal(limpiarDescripcion("En la foto hay dos personas comiendo"), "Dos personas comiendo");
  assert.equal(limpiarDescripcion("   "), "");
  assert.equal(limpiarDescripcion(null), "");
  const larga = limpiarDescripcion("palabra ".repeat(40));
  assert.ok(larga.length <= MAX_DESCRIPCION, String(larga.length));
  assert.ok(!larga.endsWith(" "));
});

test("limpiarDescripcion: si el modelo se niega o no ve nada, no se toma como descripción", () => {
  assert.equal(limpiarDescripcion("Lo siento, no puedo ayudar con eso."), "");
  assert.equal(limpiarDescripcion("I can't help with that."), "");
  assert.equal(limpiarDescripcion("No puedo ver la imagen"), "");
});

test("verLote: una descripción por foto, en el mismo orden", async () => {
  const r = await verLote(["a", "b", "c"], async (f) => `Foto ${f}`);
  assert.deepEqual(r, ["Foto a", "Foto b", "Foto c"]);
});

test("verLote: la foto que falla se reintenta una vez; si vuelve a fallar queda en null sin tumbar a las demás", async () => {
  const intentos: Record<string, number> = {};
  const r = await verLote(["bien", "segunda", "nunca"], async (f) => {
    intentos[f] = (intentos[f] ?? 0) + 1;
    if (f === "nunca") throw new Error("x");
    if (f === "segunda" && intentos[f] === 1) throw new Error("x");
    return `Vi ${f}`;
  });
  assert.deepEqual(r, ["Vi bien", "Vi segunda", null]);
  assert.deepEqual(intentos, { bien: 1, segunda: 2, nunca: 2 });
});

test("verLote: una respuesta vacía o una negativa cuenta como no vista", async () => {
  assert.deepEqual(await verLote(["a", "b"], async (f) => (f === "a" ? "  " : "Lo siento, no puedo")), [null, null]);
});

test("verLote: nunca van más de 3 fotos a la vez", async () => {
  let ahora = 0;
  let maximo = 0;
  await verLote(Array.from({ length: 8 }, (_, i) => String(i)), async (f) => {
    ahora++;
    maximo = Math.max(maximo, ahora);
    await new Promise((s) => setTimeout(s, 5));
    ahora--;
    return `Foto ${f}`;
  });
  assert.ok(maximo <= 3, `fueron ${maximo}`);
  assert.ok(maximo >= 2);
});

import { activarVision, esFaltaDeLicencia } from "./ver-fotos";

test("esFaltaDeLicencia: reconoce el aviso de Cloudflare de que falta aceptar la licencia del modelo", () => {
  assert.equal(esFaltaDeLicencia("Prior to using this model, you must submit the prompt 'agree'."), true);
  assert.equal(esFaltaDeLicencia("Model Agreement: you must accept the license"), true);
  assert.equal(esFaltaDeLicencia("Capacity temporarily exceeded"), false);
  assert.equal(esFaltaDeLicencia(undefined), false);
});

test("activarVision: manda «agree» al modelo de visión con la cuenta dada", async () => {
  const visto: { url: string; cuerpo: string; auth: string }[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    visto.push({ url: String(url), cuerpo: String(init?.body), auth: String((init?.headers as Record<string, string>).Authorization) });
    return new Response(JSON.stringify({ success: true, result: { response: "Thank you for agreeing" } }), { status: 200 });
  };
  assert.deepEqual(await activarVision({ accountId: "cuenta 1", token: "tok" }, f as typeof fetch), { ok: true });
  assert.equal(visto.length, 1);
  assert.equal(visto[0].url, "https://api.cloudflare.com/client/v4/accounts/cuenta%201/ai/run/@cf/meta/llama-3.2-11b-vision-instruct");
  assert.deepEqual(JSON.parse(visto[0].cuerpo), { prompt: "agree" });
  assert.equal(visto[0].auth, "Bearer tok");
});

test("activarVision: si Cloudflare lo rechaza o no hay conexión, lo dice sin romperse", async () => {
  const rechaza = async () => new Response(JSON.stringify({ success: false, errors: [{ message: "Authentication error" }] }), { status: 403 });
  assert.deepEqual(await activarVision({ accountId: "a", token: "t" }, rechaza as typeof fetch), { ok: false, error: "Authentication error" });
  const caido = async () => Promise.reject(new Error("red"));
  assert.deepEqual(await activarVision({ accountId: "a", token: "t" }, caido as typeof fetch), { ok: false, error: "No se pudo conectar con Cloudflare. Intenta de nuevo." });
  assert.deepEqual(await activarVision({ accountId: "", token: "" }), { ok: false, error: "Faltan las claves de Cloudflare de la plataforma." });
});

test("activarVision: Cloudflare confirma la aceptación con forma de error; eso cuenta como activado", async () => {
  const gracias = async () =>
    new Response(JSON.stringify({ success: false, errors: [{ message: "AiError: Model Agreement: Thank you for agreeing to this model's terms. You may now use the model. (b744)" }] }), { status: 403 });
  assert.deepEqual(await activarVision({ accountId: "a", token: "t" }, gracias as typeof fetch), { ok: true });
});

test("limpiarDescripcion: quita también «Se ve…» al inicio", () => {
  assert.equal(limpiarDescripcion("Se ve un tarjeta de recomendación"), "Un tarjeta de recomendación");
  assert.equal(limpiarDescripcion("Se observan dos personas comiendo."), "Dos personas comiendo");
  assert.equal(limpiarDescripcion("Se muestra el logotipo del negocio"), "El logotipo del negocio");
});

test("limpiarDescripcion: una frase larga se corta en una idea completa, no a media palabra ni colgando", () => {
  // casos reales del modelo: antes quedaban en «…con el nombre de», «…digital y una», «…a la izquierda de la»
  assert.equal(
    limpiarDescripcion("Un escáner de código de barras de un usuario de Cash App, con el nombre de Fulano de Tal en la parte inferior"),
    "Un escáner de código de barras de un usuario de Cash App",
  );
  assert.equal(
    limpiarDescripcion("Se ve un tarjeta de recomendación, una tarjeta de presentación digital y una tarjeta de pago sobre fondo azul"),
    "Un tarjeta de recomendación, una tarjeta de presentación digital",
  );
  assert.equal(
    limpiarDescripcion("El logotipo de InnovationTECH Studio, que se encuentra a la izquierda de la pantalla principal de la app"),
    "El logotipo de InnovationTECH Studio, que se encuentra a la izquierda",
  );
  // sin comas: se quitan las palabras sueltas del final
  const sinComas = limpiarDescripcion("Una mesa larga de madera con muchas tortas recién hechas servidas en platos blancos para toda la familia y los");
  assert.ok(sinComas.length <= MAX_DESCRIPCION);
  assert.doesNotMatch(sinComas, /\s(?:y|los|la|de|para|con|en|el|una?)$/i, sinComas);
  assert.match(sinComas, /^Una mesa larga de madera con muchas tortas/);
});

test("limpiarDescripcion: una frase corta no se toca", () => {
  assert.equal(limpiarDescripcion("Dos personas comiendo en la barra del local"), "Dos personas comiendo en la barra del local");
});

test("instruccionesVer: pide no copiar nombres de personas que aparezcan escritos", () => {
  assert.match(instruccionesVer(), /nombres? de personas? .*escrit/i);
});
