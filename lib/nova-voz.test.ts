import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_VOZ_NOVA,
  VOZ_NOVA_DEFECTO,
  crearLimitador,
  crearVozNova,
  trozosDeVoz,
  validarVoz,
  vocesNova,
  vozNova,
} from "./nova-voz";

// ---------- trozosDeVoz ----------

test("trozosDeVoz: un texto corto queda en un solo trozo", () => {
  assert.deepEqual(trozosDeVoz("Hola, soy NOVA. ¿Qué creamos hoy?"), ["Hola, soy NOVA. ¿Qué creamos hoy?"]);
});

test("trozosDeVoz: vacío o solo espacios → ninguno", () => {
  assert.deepEqual(trozosDeVoz(""), []);
  assert.deepEqual(trozosDeVoz("   \n  "), []);
});

test("trozosDeVoz: quita Markdown (títulos, negritas, viñetas, enlaces, código, tablas)", () => {
  const t = trozosDeVoz("## Tu post\n\n**Oferta** de _hoy_:\n- 2x1 en `tortas`\n> Ven ya\n[Visítanos](https://x.com)\n| a | b |\n|---|---|\n---");
  const todo = t.join(" ");
  assert.doesNotMatch(todo, /[*#_`>|]/);
  assert.doesNotMatch(todo, /https?:/);
  assert.match(todo, /Tu post/);
  assert.match(todo, /Oferta de hoy/);
  assert.match(todo, /2x1 en tortas/);
  assert.match(todo, /Visítanos/);
});

test("trozosDeVoz: quita las líneas PROMPT DE IMAGEN", () => {
  const t = trozosDeVoz("Aquí va tu post.\nPROMPT DE IMAGEN: una torta dorada\n**PROMPT DE IMAGEN:** pan recién hecho");
  assert.deepEqual(t, ["Aquí va tu post."]);
});

test("trozosDeVoz: corta por oraciones y ningún trozo pasa del máximo", () => {
  const oracion = "Esta es una oración de prueba para la voz de NOVA. ";
  const texto = oracion.repeat(30);
  const t = trozosDeVoz(texto);
  assert.ok(t.length > 1);
  for (const x of t) {
    assert.ok(x.length <= MAX_VOZ_NOVA, `trozo de ${x.length}`);
    assert.match(x, /\.$/); // termina en oración completa
  }
  assert.equal(t.join(" ").replace(/\s+/g, " "), texto.trim().replace(/\s+/g, " "));
});

test("trozosDeVoz: respeta un máximo propio y parte oraciones larguísimas sin cortar palabras", () => {
  const larga = Array.from({ length: 80 }, (_, i) => `palabra${i}`).join(" ");
  const t = trozosDeVoz(larga, 100);
  for (const x of t) assert.ok(x.length <= 100);
  assert.equal(t.join(" "), larga);
});

test("trozosDeVoz: cada línea cuenta como una frase (las viñetas no se juntan sin pausa)", () => {
  const t = trozosDeVoz("- Primera idea\n- Segunda idea");
  assert.deepEqual(t, ["Primera idea. Segunda idea"]);
});

// ---------- voces de NOVA ----------

test("vocesNova: solo voces Aura-2 del idioma, sin la Básica", () => {
  const es = vocesNova("es");
  assert.ok(es.length >= 5);
  assert.ok(es.every((v) => v.lang === "es" && !v.basic && v.model === "@cf/deepgram/aura-2-es" && v.speaker));
  assert.ok(vocesNova("en").every((v) => v.lang === "en" && !v.basic && v.model === "@cf/deepgram/aura-2-en"));
});

test("vozNova: por defecto estrella (es) y luna (en); ids ajenos, básicos o de otro idioma → la de defecto", () => {
  assert.equal(VOZ_NOVA_DEFECTO.es, "es-estrella");
  assert.equal(VOZ_NOVA_DEFECTO.en, "en-luna");
  assert.equal(vozNova(undefined, "es").speaker, "estrella");
  assert.equal(vozNova(undefined, "en").speaker, "luna");
  assert.equal(vozNova("es-javier", "es").speaker, "javier");
  assert.equal(vozNova("es-basica", "es").speaker, "estrella");
  assert.equal(vozNova("@cf/otro-modelo", "es").speaker, "estrella");
  assert.equal(vozNova({ id: "es-javier" }, "es").speaker, "estrella");
  assert.equal(vozNova("es-javier", "en").speaker, "luna");
});

// ---------- validarVoz (ruta /api/nova/voz) ----------

test("validarVoz: texto que no es texto, vacío o de más de 400 letras → error", () => {
  for (const text of [undefined, null, 5, ["hola"], { a: 1 }, "", "   ", "a".repeat(401)]) {
    const r = validarVoz({ text, lang: "es" });
    assert.equal(r.ok, false, `debió fallar: ${JSON.stringify(text)}`);
  }
  assert.equal(validarVoz(null).ok, false);
  assert.equal(validarVoz("hola").ok, false);
});

test("validarVoz: texto válido → idioma y voz limpios", () => {
  const r = validarVoz({ text: "a".repeat(400), lang: "en", voice: "en-orion" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.lang, "en");
    assert.equal(r.voz.speaker, "orion");
  }
  const r2 = validarVoz({ text: "Hola", lang: "fr", voice: "es-basica" });
  assert.ok(r2.ok);
  if (r2.ok) {
    assert.equal(r2.lang, "es");
    assert.equal(r2.voz.speaker, "estrella");
    assert.equal(r2.text, "Hola");
  }
});

// ---------- crearLimitador ----------

test("crearLimitador: 1 pedido cada 3 s por persona", () => {
  const permitir = crearLimitador(3000);
  assert.equal(permitir("ana", 1000), true);
  assert.equal(permitir("ana", 2000), false);
  assert.equal(permitir("ana", 3999), false);
  assert.equal(permitir("beto", 2000), true); // otra persona no espera
  assert.equal(permitir("ana", 4000), true);
});

test("crearLimitador: un pedido rechazado no alarga la espera", () => {
  const permitir = crearLimitador(3000);
  assert.equal(permitir("ana", 0), true);
  assert.equal(permitir("ana", 2900), false);
  assert.equal(permitir("ana", 3000), true);
});

test("crearLimitador: no crece sin fin (borra a quien ya puede volver a pedir)", () => {
  const permitir = crearLimitador(3000, 10);
  for (let i = 0; i < 50; i++) permitir(`p${i}`, 0);
  assert.equal(permitir("nuevo", 10_000), true);
  assert.equal(permitir.tamano(), 1);
});

// ---------- crearVozNova (reproductor con dobles de prueba) ----------

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function dobles(o: { fallaPedir?: (t: string) => boolean; durar?: number } = {}) {
  const log: string[] = [];
  const pendientes: (() => void)[] = [];
  let detenido = 0;
  const deps = {
    pedir: async (t: string) => {
      log.push(`pedir:${t}`);
      await espera();
      if (o.fallaPedir?.(t)) throw new Error("falló");
      return new Blob([t]);
    },
    reproducir: async (b: Blob) => {
      const t = await b.text();
      log.push(`sonar:${t}`);
      if (o.durar === -1) await new Promise<void>((r) => pendientes.push(r)); // se queda sonando
      else await espera(o.durar ?? 0);
    },
    respaldo: async (t: string) => {
      log.push(`respaldo:${t}`);
    },
    detener: () => {
      detenido++;
      for (const r of pendientes.splice(0)) r();
    },
    espacioMs: 0,
  };
  return { deps, log, detenidas: () => detenido };
}

const hasta = async (cond: () => boolean, ms = 1000) => {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error("tiempo agotado");
    await espera(2);
  }
};

test("crearVozNova: suena todos los trozos en orden y avisa cuando termina", async () => {
  const { deps, log } = dobles();
  const cambios: boolean[] = [];
  const voz = crearVozNova({ ...deps, alCambiar: (h) => cambios.push(h) });
  assert.equal(voz.hablando(), false);
  voz.decir("Uno. " + "x".repeat(390) + ". Dos.");
  assert.equal(voz.hablando(), true);
  await hasta(() => !voz.hablando());
  const sonados = log.filter((l) => l.startsWith("sonar:"));
  assert.equal(sonados.length, 2);
  assert.ok(sonados[0].startsWith("sonar:Uno."));
  assert.ok(sonados[1].endsWith("Dos."));
  assert.deepEqual(cambios, [true, false]);
});

test("crearVozNova: callar detiene el audio y no suena nada más", async () => {
  const { deps, log, detenidas } = dobles({ durar: -1 });
  const voz = crearVozNova(deps);
  voz.decir("Primera oración. " + "y".repeat(395) + ". Tercera.");
  await hasta(() => log.some((l) => l.startsWith("sonar:")));
  voz.callar();
  assert.equal(voz.hablando(), false);
  assert.ok(detenidas() >= 1);
  await espera(20);
  assert.equal(log.filter((l) => l.startsWith("sonar:")).length, 1);
});

test("crearVozNova: decir reemplaza lo que suena (nunca dos voces a la vez)", async () => {
  const { deps, log } = dobles({ durar: -1 });
  const voz = crearVozNova(deps);
  voz.decir("Viejo uno. " + "z".repeat(395) + ". Viejo dos.");
  await hasta(() => log.some((l) => l.startsWith("sonar:Viejo")));
  voz.decir("Nuevo.");
  await hasta(() => log.includes("sonar:Nuevo."));
  assert.ok(!log.some((l) => l.includes("Viejo dos")));
  assert.equal(voz.hablando(), true);
});

test("crearVozNova: si pedir falla, ese trozo usa la voz del aparato y sigue", async () => {
  const { deps, log } = dobles({ fallaPedir: (t) => t.startsWith("Mal") });
  const voz = crearVozNova(deps);
  voz.decir("Mal trozo. " + "w".repeat(395) + ". Fin.");
  await hasta(() => !voz.hablando());
  assert.ok(log.some((l) => l.startsWith("respaldo:Mal trozo.")));
  assert.ok(log.some((l) => l.startsWith("sonar:") && l.endsWith("Fin.")));
});

test("crearVozNova: si reproducir falla (audio bloqueado), usa la voz del aparato", async () => {
  const { deps, log } = dobles();
  const voz = crearVozNova({ ...deps, reproducir: async () => Promise.reject(new Error("bloqueado")) });
  voz.decir("Hola.");
  await hasta(() => !voz.hablando());
  assert.deepEqual(log.filter((l) => l.startsWith("respaldo:")), ["respaldo:Hola."]);
});

test("crearVozNova: deja al menos espacioMs entre pedidos (el servidor acepta 1 cada 3 s)", async () => {
  const tiempos: number[] = [];
  const voz = crearVozNova({
    pedir: async (t) => (tiempos.push(Date.now()), new Blob([t])),
    reproducir: async () => {},
    respaldo: async () => {},
    espacioMs: 60,
  });
  voz.decir("Uno. " + "v".repeat(390) + ". Dos.");
  await hasta(() => !voz.hablando());
  assert.equal(tiempos.length, 2);
  assert.ok(tiempos[1] - tiempos[0] >= 55, `solo ${tiempos[1] - tiempos[0]} ms`);
});

test("crearVozNova: texto sin nada que leer no hace nada", async () => {
  const { deps, log } = dobles();
  const voz = crearVozNova(deps);
  voz.decir("PROMPT DE IMAGEN: algo");
  assert.equal(voz.hablando(), false);
  await espera(10);
  assert.deepEqual(log, []);
});
