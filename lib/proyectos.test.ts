import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PROYECTOS, archivosDe, borrarProyecto, cambiarA, crearProyecto, guardarActivo, leerProyectos, renombrarProyecto, videosDeOtros, type Almacen } from "./proyectos";

function almacen(inicial: Record<string, string> = {}): Almacen & { datos: Map<string, string> } {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    get length() {
      return datos.size;
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}
const clips = (...c: object[]) => JSON.stringify(c);
const borrador = { "its-draft:reel:tema": '"promo martes"', "its-draft:reel:escenas-datos": clips({ id: "a", tipo: "foto", imageId: "reel-f1" }), "its-lang": "es" };

test("primer uso: el borrador que ya había es «Mi video»", () => {
  const a = almacen(borrador);
  const r = leerProyectos(a);
  assert.equal(r.proyectos.length, 1);
  assert.equal(r.proyectos[0].nombre, "Mi video");
  assert.equal(r.activo, r.proyectos[0].id);
  assert.equal(a.getItem("its-draft:reel:tema"), '"promo martes"'); // intacto
  assert.deepEqual(leerProyectos(a).proyectos.map((p) => p.id), [r.activo]); // leer otra vez no crea otro
});

test("crear un proyecto nuevo guarda el actual y deja el nuevo en blanco", () => {
  const a = almacen(borrador);
  const primero = leerProyectos(a).activo;
  const r = crearProyecto(a, "Promo de mayo");
  assert.ok(r.ok);
  const estado = leerProyectos(a);
  assert.equal(estado.proyectos.length, 2);
  assert.equal(estado.activo, r.ok && r.id);
  assert.equal(a.getItem("its-draft:reel:tema"), null); // en blanco
  assert.equal(a.getItem("its-lang"), "es"); // lo que no es del reel no se toca
  assert.equal(estado.proyectos.find((p) => p.id === primero)!.datos["its-draft:reel:tema"], '"promo martes"');
});

test("cambiar de proyecto no pierde nada de ninguno", () => {
  const a = almacen(borrador);
  const primero = leerProyectos(a).activo;
  const r = crearProyecto(a, "Otro");
  assert.ok(r.ok);
  a.setItem("its-draft:reel:tema", '"video nuevo"');
  cambiarA(a, primero);
  assert.equal(leerProyectos(a).activo, primero);
  assert.equal(a.getItem("its-draft:reel:tema"), '"promo martes"');
  cambiarA(a, r.ok ? r.id : "");
  assert.equal(a.getItem("its-draft:reel:tema"), '"video nuevo"');
  cambiarA(a, "no-existe");
  assert.equal(a.getItem("its-draft:reel:tema"), '"video nuevo"');
});

test("guardarActivo copia lo que hay en pantalla al proyecto activo", () => {
  const a = almacen(borrador);
  const id = leerProyectos(a).activo;
  a.setItem("its-draft:reel:cta", '"Ven hoy"');
  guardarActivo(a);
  assert.equal(leerProyectos(a).proyectos.find((p) => p.id === id)!.datos["its-draft:reel:cta"], '"Ven hoy"');
});

test("renombrar: nombre limpio, corto y nunca vacío", () => {
  const a = almacen(borrador);
  const id = leerProyectos(a).activo;
  renombrarProyecto(a, id, "  Promo   de mayo  ");
  assert.equal(leerProyectos(a).proyectos[0].nombre, "Promo de mayo");
  renombrarProyecto(a, id, "   ");
  assert.equal(leerProyectos(a).proyectos[0].nombre, "Promo de mayo");
  renombrarProyecto(a, id, "x".repeat(200));
  assert.equal(leerProyectos(a).proyectos[0].nombre.length, 40);
});

test("máximo 20 proyectos", () => {
  const a = almacen(borrador);
  leerProyectos(a);
  for (let i = 1; i < MAX_PROYECTOS; i++) assert.ok(crearProyecto(a, `P${i}`).ok);
  const r = crearProyecto(a, "de más");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, "Ya tienes 20 videos guardados. Borra alguno para crear otro.");
  assert.equal(leerProyectos(a).proyectos.length, 20);
});

test("archivosDe: fotos y videos subidos de un proyecto", () => {
  const datos = { "its-draft:reel:escenas-datos": clips({ imageId: "reel-f1" }, { imageId: "reel-p1", archivoId: "reelvid-v1" }, { archivoId: "gal:9" }, {}) };
  assert.deepEqual(archivosDe(datos), { fotos: ["reel-f1", "reel-p1"], videos: ["reelvid-v1"] });
  assert.deepEqual(archivosDe({ "its-draft:reel:escenas-datos": "no es json" }), { fotos: [], videos: [] });
  assert.deepEqual(archivosDe({}), { fotos: [], videos: [] });
});

test("borrar un proyecto: devuelve solo los archivos que nadie más usa y nunca deja sin proyecto", () => {
  const a = almacen({ "its-draft:reel:escenas-datos": clips({ imageId: "reel-f1", archivoId: "reelvid-comun" }, { imageId: "reel-f2", archivoId: "reelvid-solo1" }) });
  const uno = leerProyectos(a).activo;
  const r = crearProyecto(a, "Dos");
  assert.ok(r.ok);
  const dos = r.ok ? r.id : "";
  a.setItem("its-draft:reel:escenas-datos", clips({ imageId: "reel-f3", archivoId: "reelvid-comun" }));
  // borrar el que no está activo
  const b1 = borrarProyecto(a, uno);
  assert.deepEqual(b1.archivos.sort(), ["reel-f1", "reel-f2", "reelvid-solo1"]);
  assert.deepEqual(leerProyectos(a).proyectos.map((p) => p.id), [dos]);
  assert.equal(leerProyectos(a).activo, dos);
  // borrar el único que queda: aparece uno nuevo en blanco
  const b2 = borrarProyecto(a, dos);
  assert.deepEqual(b2.archivos.sort(), ["reel-f3", "reelvid-comun"]);
  const fin = leerProyectos(a);
  assert.equal(fin.proyectos.length, 1);
  assert.notEqual(fin.activo, dos);
  assert.equal(a.getItem("its-draft:reel:escenas-datos"), null);
});

test("borrar el proyecto activo pasa a otro con sus datos", () => {
  const a = almacen(borrador);
  const uno = leerProyectos(a).activo;
  const r = crearProyecto(a, "Dos");
  assert.ok(r.ok);
  borrarProyecto(a, r.ok ? r.id : "");
  assert.equal(leerProyectos(a).activo, uno);
  assert.equal(a.getItem("its-draft:reel:tema"), '"promo martes"');
});

test("videosDeOtros: los videos subidos de los proyectos que no están abiertos", () => {
  const a = almacen({ "its-draft:reel:escenas-datos": clips({ archivoId: "reelvid-a" }) });
  leerProyectos(a);
  crearProyecto(a, "Dos");
  a.setItem("its-draft:reel:escenas-datos", clips({ archivoId: "reelvid-b" }));
  assert.deepEqual(videosDeOtros(a), ["reelvid-a"]);
});

test("datos dañados: se empieza con «Mi video» sin romper nada", () => {
  const a = almacen({ ...borrador, "its-proyectos": "{esto no es json" });
  const r = leerProyectos(a);
  assert.equal(r.proyectos.length, 1);
  assert.equal(a.getItem("its-draft:reel:tema"), '"promo martes"');
});

test("archivosDe: la voz guardada del proyecto también es suya", () => {
  const datos = { "its-draft:reel:escenas-datos": clips({ imageId: "reel-f1" }), "its-draft:reel:voz-archivo": JSON.stringify({ id: "reelvoz-1" }) };
  assert.deepEqual(archivosDe(datos), { fotos: ["reel-f1", "reelvoz-1"], videos: [] });
  assert.deepEqual(archivosDe({ "its-draft:reel:voz-archivo": "null" }), { fotos: [], videos: [] });
  assert.deepEqual(archivosDe({ "its-draft:reel:voz-archivo": "{roto" }), { fotos: [], videos: [] });
});
