import test from "node:test";
import assert from "node:assert/strict";
import { MAX_VIDEO_MB, huerfanos, idDeArchivo, origenDe, revisarArchivo } from "./video-propio";

const MB = 1024 * 1024;

test("revisarArchivo: tamaño, tipo y archivo vacío", () => {
  assert.equal(MAX_VIDEO_MB, 100);
  assert.equal(revisarArchivo({ size: 20 * MB, type: "video/mp4" }), null);
  assert.equal(revisarArchivo({ size: 100 * MB, type: "video/quicktime" }), null);
  assert.equal(revisarArchivo({ size: 100 * MB + 1, type: "video/mp4" }), "Ese video pesa más de 100 MB.");
  assert.equal(revisarArchivo({ size: 5 * MB, type: "image/png" }), "Elige un archivo de video.");
  assert.equal(revisarArchivo({ size: 0, type: "video/mp4" }), "Este video no se puede abrir en tu navegador.");
  // algunos celulares no dicen el tipo: se deja pasar y se comprueba al abrirlo
  assert.equal(revisarArchivo({ size: 5 * MB, type: "" }), null);
});

test("idDeArchivo y origenDe", () => {
  assert.equal(idDeArchivo("dispositivo", "abc"), "reelvid-abc");
  assert.equal(idDeArchivo("galeria", "9x"), "gal:9x");
  assert.deepEqual(origenDe("reelvid-abc"), { origen: "dispositivo", id: "reelvid-abc" });
  assert.deepEqual(origenDe("gal:9x"), { origen: "galeria", id: "9x" });
  assert.equal(origenDe("otra-cosa"), null);
});

test("huerfanos: solo los videos del reel que ningún clip usa; nunca fotos ni la galería", () => {
  assert.deepEqual(huerfanos(["reelvid-a", "reelvid-b", "reel-foto1", "otro"], ["reelvid-a", "gal:9"]), ["reelvid-b"]);
  assert.deepEqual(huerfanos([], ["reelvid-a"]), []);
});
