import { test } from "node:test";
import assert from "node:assert/strict";
import { CAROUSEL_FORMATS, CAROUSEL_STYLES, contraste, paletteFor, SIZES } from "./carousel-estilos";
import { emptyBrand, type Brand } from "./brand";

const marca = (color: string, oscuro = "#0d1630"): Brand => ({ ...emptyBrand, palette: [color, oscuro, "#ffffff"] });
const MARCAS = [marca("#e5243b"), marca("#0d1630", "#111111"), marca("#ffe14d"), marca("#ffffff"), marca("#000000"), emptyBrand];

test("formatos: los cinco, con su tamaño en píxeles", () => {
  assert.deepEqual(CAROUSEL_FORMATS.map((f) => f.id), ["4:5", "1:1", "9:16", "2:3", "16:9"]);
  assert.deepEqual(SIZES, { "4:5": [1080, 1350], "1:1": [1080, 1080], "9:16": [1080, 1920], "2:3": [1000, 1500], "16:9": [1920, 1080] });
});

test("estilos: los siete", () => {
  assert.deepEqual(CAROUSEL_STYLES.map((s) => s.id), ["oscuro", "claro", "color", "negro", "blanco", "suave", "contraste"]);
});

test("contraste: negro sobre blanco es 21 y un color consigo mismo es 1", () => {
  assert.equal(Math.round(contraste("#000000", "#ffffff")), 21);
  assert.equal(contraste("#e5243b", "#e5243b"), 1);
});

test("en todos los estilos y con cualquier color de marca, el título se lee sobre el fondo", () => {
  for (const b of MARCAS) for (const { id } of CAROUSEL_STYLES) {
    const p = paletteFor(id, b, false);
    assert.match(p.bg, /^#[0-9a-f]{6}$/i, `${id}: fondo en hex`);
    assert.ok(contraste(p.text, p.bg) >= 3, `${id} con ${b.palette[0] ?? "sin color"}: título ${p.text} sobre ${p.bg}`);
    assert.ok(contraste(p.accent, p.bg) >= 1.6, `${id} con ${b.palette[0] ?? "sin color"}: acento ${p.accent} sobre ${p.bg}`);
  }
});

test("estilos nuevos: negro y blanco puros; suave es un tono claro del color de marca; contraste usa el color en el título", () => {
  const b = marca("#e5243b");
  assert.equal(paletteFor("negro", b, false).bg, "#000000");
  assert.equal(paletteFor("negro", b, false).text, "#e5243b");
  assert.equal(paletteFor("blanco", b, false).bg, "#ffffff");
  assert.equal(paletteFor("contraste", b, false).text, "#e5243b");
  const suave = paletteFor("suave", b, false);
  assert.notEqual(suave.bg, "#ffffff");
  assert.ok(contraste(suave.bg, "#ffffff") < 1.4, "suave: fondo muy claro");
  // Con foto de fondo manda la foto: texto blanco, igual en todos los estilos
  assert.equal(paletteFor("blanco", b, true).text, "#ffffff");
});
