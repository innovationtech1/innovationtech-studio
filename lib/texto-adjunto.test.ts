import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_IMAGEN_MB, MAX_VIDEO_ADJUNTO_MB, compartirTexto, nombreAdjunto, textoParaPublicar, validarAdjunto } from "./texto-adjunto";

const MB = 1024 * 1024;

test("textoParaPublicar: quita las ideas internas para imagen y video y deja la publicación", () => {
  const r = "¡2x1 en tortas los martes!\n\n#tortas #sanantonio\n\nPROMPT DE IMAGEN: a torta on a wooden table\n**PROMPT DE VIDEO:** slow zoom on the torta\n";
  assert.equal(textoParaPublicar(r), "¡2x1 en tortas los martes!\n\n#tortas #sanantonio");
});

test("textoParaPublicar: sin ideas internas el texto queda igual, sin espacios de sobra ni huecos largos", () => {
  assert.equal(textoParaPublicar("  Hola\n\n\n\n\nMundo  \n"), "Hola\n\nMundo");
  assert.equal(textoParaPublicar(""), "");
  assert.equal(textoParaPublicar("- PROMPT DE IMAGEN: solo esto"), "");
});

test("validarAdjunto: acepta imágenes y videos y dice de qué tipo es", () => {
  assert.deepEqual(validarAdjunto({ type: "image/jpeg", size: 2 * MB, name: "a.jpg" }), { ok: true, tipo: "imagen" });
  assert.deepEqual(validarAdjunto({ type: "video/mp4", size: 40 * MB, name: "a.mp4" }), { ok: true, tipo: "video" });
  // algunos teléfonos no dicen el tipo: se reconoce por la terminación
  assert.deepEqual(validarAdjunto({ type: "", size: MB, name: "FOTO.HEIC" }), { ok: true, tipo: "imagen" });
  assert.deepEqual(validarAdjunto({ type: "", size: MB, name: "clip.MOV" }), { ok: true, tipo: "video" });
});

test("validarAdjunto: rechaza con un motivo claro lo que no es imagen ni video, lo vacío y lo que pesa de más", () => {
  assert.deepEqual(validarAdjunto({ type: "application/pdf", size: MB, name: "a.pdf" }), { ok: false, error: "Ese archivo no es una imagen ni un video." });
  assert.deepEqual(validarAdjunto({ type: "image/png", size: 0, name: "a.png" }), { ok: false, error: "Ese archivo está vacío." });
  assert.deepEqual(validarAdjunto({ type: "image/png", size: (MAX_IMAGEN_MB + 1) * MB, name: "a.png" }), { ok: false, error: `Esa imagen pesa más de ${MAX_IMAGEN_MB} MB.` });
  assert.deepEqual(validarAdjunto({ type: "video/mp4", size: (MAX_VIDEO_ADJUNTO_MB + 1) * MB, name: "a.mp4" }), { ok: false, error: `Ese video pesa más de ${MAX_VIDEO_ADJUNTO_MB} MB.` });
  assert.equal(validarAdjunto({ type: "video/mp4", size: MAX_VIDEO_ADJUNTO_MB * MB, name: "a.mp4" }).ok, true);
});

test("nombreAdjunto: un nombre limpio con la terminación que corresponde al archivo", () => {
  assert.equal(nombreAdjunto("imagen", "image/png"), "publicacion-innovationtech.png");
  assert.equal(nombreAdjunto("imagen", "image/jpeg"), "publicacion-innovationtech.jpg");
  assert.equal(nombreAdjunto("imagen", ""), "publicacion-innovationtech.jpg");
  assert.equal(nombreAdjunto("video", "video/webm"), "publicacion-innovationtech.webm");
  assert.equal(nombreAdjunto("video", "video/quicktime"), "publicacion-innovationtech.mov");
  assert.equal(nombreAdjunto("video", ""), "publicacion-innovationtech.mp4");
});

test("compartirTexto: abre el menú de compartir del aparato con el texto", async () => {
  const visto: ShareData[] = [];
  const r = await compartirTexto("Hola", { share: async (d) => void visto.push(d) });
  assert.equal(r, "compartido");
  assert.deepEqual(visto, [{ text: "Hola" }]);
});

test("compartirTexto: si la persona cierra el menú no pasa nada; si no hay menú o falla, se copia", async () => {
  const cancelar = async () => {
    throw Object.assign(new Error("x"), { name: "AbortError" });
  };
  assert.equal(await compartirTexto("Hola", { share: cancelar }), "cancelado");
  const copiado: string[] = [];
  const portapapeles = { writeText: async (t: string) => void copiado.push(t) };
  assert.equal(await compartirTexto("Hola", { clipboard: portapapeles }), "copiado");
  assert.equal(await compartirTexto("Hola", { share: async () => Promise.reject(new Error("no")), clipboard: portapapeles }), "copiado");
  assert.deepEqual(copiado, ["Hola", "Hola"]);
});

test("compartirTexto: sin texto, o sin menú ni portapapeles, lo dice en lugar de romperse", async () => {
  assert.equal(await compartirTexto("   ", { share: async () => {} }), "vacio");
  assert.equal(await compartirTexto("Hola", {}), "fallo");
  assert.equal(await compartirTexto("Hola", undefined), "fallo");
  assert.equal(await compartirTexto("Hola", { clipboard: { writeText: async () => Promise.reject(new Error("no")) } }), "fallo");
});
