import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTACTO_LEGAL, PRIVACIDAD, TERMINOS, VERSION_LEGAL, type DocumentoLegal } from "./legal";

// El español y el inglés deben decir lo mismo: misma cantidad de secciones y nada vacío.
function revisar(nombre: string, doc: Record<"es" | "en", DocumentoLegal>) {
  assert.equal(doc.es.secciones.length, doc.en.secciones.length, `${nombre}: mismas secciones en es y en`);
  for (const lang of ["es", "en"] as const) {
    const d = doc[lang];
    assert.ok(d.titulo.trim(), `${nombre}.${lang}: título`);
    assert.ok(d.actualizado.trim(), `${nombre}.${lang}: fecha`);
    assert.ok(d.secciones.length > 0, `${nombre}.${lang}: secciones`);
    d.secciones.forEach((s, i) => {
      assert.ok(s.titulo.trim(), `${nombre}.${lang} sección ${i + 1}: título`);
      assert.ok(s.parrafos.length > 0, `${nombre}.${lang} sección ${i + 1}: párrafos`);
      for (const p of s.parrafos) assert.ok(p.trim(), `${nombre}.${lang} sección ${i + 1}: párrafo vacío`);
    });
    d.secciones.forEach((s, i) => assert.equal(s.parrafos.length, doc.es.secciones[i].parrafos.length, `${nombre}.${lang} sección ${i + 1}: mismos párrafos`));
  }
}

test("TERMINOS: es y en con las mismas secciones y sin textos vacíos", () => revisar("TERMINOS", TERMINOS));
test("PRIVACIDAD: es y en con las mismas secciones y sin textos vacíos", () => revisar("PRIVACIDAD", PRIVACIDAD));

test("VERSION_LEGAL es una fecha AAAA-MM-DD y hay correo de contacto", () => {
  assert.match(VERSION_LEGAL, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(CONTACTO_LEGAL, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});
