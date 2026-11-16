// NOVA, la asistente de Studio: sus instrucciones, el manual de la app, los datos del plan del cliente
// y qué modelo responde (rápido para dudas de uso, creativo para textos).
// Funciones puras (sin pantalla ni red) para poder probarlas.

import { CONTADORES, PAQUETES } from "./plans";

export type CuentaNova = {
  plan: string;
  estado: string;
  limites: Record<string, number>;
  uso: Record<string, number>;
  saldo: Record<string, number>;
  reinicio?: number;
  precios?: { basico: number; pro: number };
  paquetes?: { id: string; monto: number; contenido: Record<string, number> }[];
  esDueno?: boolean;
};

export type Velocidad = "rapida" | "creativa";

// Modelos de Cloudflare Workers AI. El rápido es el Llama 3.1 8B «fast» del catálogo de Cloudflare.
export const MODELO_CREATIVO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const MODELO_RAPIDO = "@cf/meta/llama-3.1-8b-instruct-fast";

// ---------- Datos del plan que manda el navegador ----------
// Vienen del navegador, así que no se confía en ellos: solo las claves conocidas, números razonables
// y textos cortos de una línea (para que no puedan inflar ni torcer las instrucciones).

const MAX_NUMERO = 1e6;
const MAX_TEXTO = 40;
const MAX_PAQUETES = 6;
const MAX_FECHA = 4102444800000; // año 2100

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const numero = (x: unknown, max = MAX_NUMERO): number | undefined =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? x : undefined;
const texto = (x: unknown): string =>
  typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_TEXTO) : "";

function contadores(x: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!esObjeto(x)) return out;
  for (const k of CONTADORES) {
    const v = numero(x[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function limpiarCuenta(x: unknown): CuentaNova | null {
  if (!esObjeto(x)) return null;
  const c: CuentaNova = {
    plan: texto(x.plan),
    estado: texto(x.estado),
    limites: contadores(x.limites),
    uso: contadores(x.uso),
    saldo: contadores(x.saldo),
  };
  const reinicio = numero(x.reinicio, MAX_FECHA);
  if (reinicio !== undefined) c.reinicio = reinicio;
  if (esObjeto(x.precios)) {
    const basico = numero(x.precios.basico);
    const pro = numero(x.precios.pro);
    if (basico !== undefined && pro !== undefined) c.precios = { basico, pro };
  }
  if (Array.isArray(x.paquetes)) {
    c.paquetes = x.paquetes
      .slice(0, MAX_PAQUETES)
      .filter(esObjeto)
      .map((p) => ({ id: texto(p.id), monto: numero(p.monto), contenido: contadores(p.contenido) }))
      .filter((p): p is { id: string; monto: number; contenido: Record<string, number> } =>
        (PAQUETES as string[]).includes(p.id) && p.monto !== undefined,
      );
  }
  if (typeof x.esDueno === "boolean") c.esDueno = x.esDueno;
  return c;
}

// ---------- Datos del plan, en palabras para la IA ----------

const NOMBRES: Record<string, [string, string]> = {
  textos: ["Textos", "Texts"],
  imagenes: ["Imágenes", "Images"],
  voces: ["Voces en off", "Voiceovers"],
  subtitulos: ["Subtítulos", "Subtitles"],
  tomas_ia: ["Tomas de video con IA", "AI video shots"],
};
const PLANES: Record<string, [string, string]> = {
  prueba: ["Prueba gratis", "Free trial"],
  basico: ["Básico", "Basic"],
  pro: ["Pro", "Pro"],
  sin_plan: ["Sin plan", "No plan"],
};
const ESTADOS: Record<string, [string, string]> = {
  activo: ["activo", "active"],
  prueba: ["en prueba", "on trial"],
  pausado: ["pausado", "paused"],
  sin_plan: ["sin plan (la prueba terminó o no ha elegido plan)", "no plan (trial ended or no plan chosen)"],
};
const PAQUETES_NOMBRE: Record<string, [string, string]> = {
  creativo: ["Creativo", "Creative"],
  voz: ["Voz", "Voice"],
  video: ["Video", "Video"],
};

const SIN_DATOS_ES = "Sin datos de plan: si preguntan por su plan o precios, explícale que no lo ves y que lo revise en Mi cuenta.";
const SIN_DATOS_EN = "No plan data: if they ask about their plan or prices, explain that you can't see it and that they can check it in My account (Mi cuenta).";

export function contextoCuenta(c: CuentaNova | null, english: boolean): string {
  if (!c) return english ? SIN_DATOS_EN : SIN_DATOS_ES;
  const i = english ? 1 : 0;
  const nombre = (tabla: Record<string, [string, string]>, k: string) => tabla[k]?.[i] ?? k;
  const lineas: string[] = [];
  lineas.push(english ? "Client's plan data (real, from their account):" : "Datos del plan del cliente (reales, de su cuenta):");
  // Plan y estado solo si son de los conocidos: un texto cualquiera del navegador no entra a las instrucciones
  if (PLANES[c.plan]) lineas.push(`Plan: ${nombre(PLANES, c.plan)}`);
  if (ESTADOS[c.estado]) lineas.push(`${english ? "Status" : "Estado"}: ${nombre(ESTADOS, c.estado)}`);

  for (const k of CONTADORES) {
    const limite = c.limites[k];
    const saldo = c.saldo[k] ?? 0;
    if (limite === undefined && !saldo) continue;
    const usado = c.uso[k] ?? 0;
    const lim = limite ?? 0;
    const queda = Math.max(0, lim - usado);
    const extra = saldo > 0 ? (english ? ` (+ balance ${saldo})` : ` (+ saldo ${saldo})`) : "";
    lineas.push(
      english
        ? `- ${nombre(NOMBRES, k)}: used ${usado} of ${lim} this month, ${queda} left${extra}`
        : `- ${nombre(NOMBRES, k)}: usó ${usado} de ${lim} este mes, le quedan ${queda}${extra}`,
    );
  }
  lineas.push(
    english
      ? "The balance comes from packs already bought: it does not expire and is used after the monthly amount runs out."
      : "El saldo es de paquetes ya comprados: no vence y se usa cuando se acaba lo del mes.",
  );

  if (c.reinicio !== undefined) {
    const fecha = new Intl.DateTimeFormat(english ? "en-US" : "es-MX", { timeZone: "America/Chicago", dateStyle: "long" }).format(c.reinicio);
    lineas.push(english ? `Monthly counters reset on ${fecha} (Chicago time).` : `Los contadores del mes vuelven a cero el ${fecha} (hora de Chicago).`);
  }
  if (c.precios) {
    lineas.push(
      english
        ? `Plan prices: Basic $${c.precios.basico} USD per month, Pro $${c.precios.pro} USD per month.`
        : `Precios de los planes: Básico $${c.precios.basico} USD al mes, Pro $${c.precios.pro} USD al mes.`,
    );
  }
  if (c.paquetes) {
    if (c.paquetes.length) {
      const lista = c.paquetes.map((p) => {
        const dentro = Object.entries(p.contenido)
          .map(([k, v]) => `${v} ${nombre(NOMBRES, k).toLowerCase()}`)
          .join(", ");
        return `${nombre(PAQUETES_NOMBRE, p.id)} $${p.monto} USD (${dentro})`;
      });
      lineas.push(english ? `Packs they can buy (one-time payment, in My account): ${lista.join("; ")}.` : `Paquetes que puede comprar (pago único, en Mi cuenta): ${lista.join("; ")}.`);
    } else {
      lineas.push(english ? "There are no packs available for their plan right now." : "Ahora no hay paquetes disponibles para su plan.");
    }
  }
  if (c.esDueno === false) {
    lineas.push(english ? "They are not the account owner: payments and plan changes are made by the owner." : "No es el dueño de la cuenta: los pagos y cambios de plan los hace el dueño.");
  }
  lineas.push(
    english
      ? "These are the only prices, limits and packs you know. If they ask about any other, say you don't have that data and suggest checking My account."
      : "Estos son los únicos precios, límites y paquetes que conoces. Si preguntan por otro, di que no tienes ese dato y sugiere revisarlo en Mi cuenta.",
  );
  return lineas.join("\n");
}

// ---------- Manual de Studio (cómo se usa la app, desde la pantalla del cliente) ----------

export const MANUAL_STUDIO = `Studio tiene estas secciones en el menú: Textos, Imágenes, Editor, Videos, Galería, Mi marca y Configuración. «Mi cuenta» (arriba) muestra el plan, lo usado del mes, los paquetes y los pagos.

TEXTOS
- Asistente: este chat. Recuerda la conversación; toca «Hazlo más corto», «Más formal», «Dame 3 variantes» u «Otra respuesta» para ajustar. Botones de cada respuesta: Copiar, Escuchar, Llevar al editor (elige una frase para tu diseño) y Crear la imagen.
- Una publicación: escribe el tema, elige la red social y genera el texto listo para publicar; desde ahí se puede pasar a imagen o a video.
- Calendario de 30 días: arma un mes de ideas de contenido; cada día se puede llevar a imagen, al editor o a un reel.

IMÁGENES
- Imagen con IA: describe lo que quieres (o usa tus fotos, opcional), elige el formato y genera. Cada imagen gasta 1 del contador «Imágenes». Se guarda en la Galería; desde ahí se edita o se anima en Videos.
- Carrusel para Instagram: crea varias diapositivas con texto; cada una se puede abrir en el Editor.
- Quitar fondo: gratis, se hace en el propio aparato.

EDITOR
Diseña sobre una imagen: textos, logo, formas, recortar, quitar fondo y borrar. Usa los colores y el logo de Mi marca. Al terminar: Descargar, Compartir, Guardar en Drive o guardar en la Galería.

VIDEOS (Creador de Reels)
1. Director con IA: escribe o dicta lo que quieres («Hazme un video de 30 segundos de mi promoción de esta semana») y la IA arma el video; luego pídele cambios ahí mismo («Pon todos los textos arriba y grandes»). Si algo gasta tomas, primero pide confirmación; hay «Deshacer».
2. Clips: la línea de tiempo. Toca un clip para ponerle foto o video, texto en pantalla, posición y tamaño del texto, transición, efecto de sonido y duración. Se pueden mover, duplicar y borrar; hay Deshacer y Rehacer.
3. Fotos con IA: en un clip con foto, elige cómo se mueve y toca «Animar esta foto ahora (1 toma)». Máximo 8 fotos con IA por video. «Rehacer (1 toma)» la vuelve a hacer; cambiar la foto o el movimiento borra la animación.
4. Marca y cierre (nombre y llamada a la acción), Voz en off (opcional, toca ▶ para escuchar voces), Música de fondo gratis y formato: Vertical 9:16 (Reels, TikTok, Historias), Cuadrado 1:1 o Horizontal 16:9.
5. «Vista previa» lo muestra sin gastar nada. «Crear reel» lo graba en el navegador. «Generar con IA» anima las fotos marcadas que falten (usa tomas) y graba el video. Si cambias la voz, «Actualizar video» no gasta tomas.
6. Al terminar: Descargar video, Compartir, Guardar en Drive y elegir la portada. Se guarda en la Galería.
«Empezar nuevo» borra el tema, los clips y el guion actuales.

ESTADOS DE UN VIDEO CON IA
- «Subiendo… 42%»: se está subiendo la foto.
- «Vista previa lista»: ya se puede ver.
- «En fila, lugar 3»: espera su turno; no hay que hacer nada.
- «Toma 1 de 3 · Generando…»: la IA está creando la toma (tarda unos minutos).
- «Listo» o «Listo al instante»: terminado.
- «Hoy ya no hay cupo; tu video se genera mañana»: se llegó al tope del día; sale solo al día siguiente, se puede cerrar la app.
- «No se pudo generar la toma, te devolvimos tu crédito»: falló y no se cobró; se puede intentar otra vez.
Si sales mientras se generan, al volver toca «Generar con IA» y se retoman sin cobrar de nuevo.

COMPARTIR Y GUARDAR
- Compartir: abre el menú del teléfono o la computadora para mandarlo a Instagram, WhatsApp, etc. Si el navegador no puede, el archivo se descarga para subirlo a mano; el texto para publicar se copia para pegarlo en la descripción.
- Guardar en Drive: sube el archivo a tu Google Drive (Google pide permiso la primera vez).

GALERÍA, MI MARCA Y CONFIGURACIÓN
- Galería: todo lo que creas aparece solo; se guarda en este aparato (otro teléfono no lo ve). Desde ahí se edita o se borra.
- Mi marca: nombre, logo (ideal PNG sin fondo), colores, contacto y estilo. La IA lo usa en textos, imágenes y videos.
- Configuración: idioma y opciones de IA.

SI ALGO FALLA
- «Este navegador no puede grabar video»: usa Chrome, Edge o Safari actualizados.
- Guardar en Drive no abre: abre Studio en Chrome o Safari; si sigue, descarga y sube a mano.
- «Falta el archivo de este video en este dispositivo»: el video se agregó en otro aparato; pon otro en ese clip.
- Llegó al límite del mes: espera a que se reinicien los contadores, compra un paquete o mejora a Pro en Mi cuenta.
- «Esta herramienta es del plan Pro»: toca «Mejorar a Pro».
- La IA no respondió o tardó: toca «Intentar otra vez» u «Otra respuesta».
- Algo más: recargar la página suele arreglarlo; si no, escribe al equipo de InnovationTECH.`;

// ---------- Instrucciones de NOVA ----------

export function instruccionesNova(o: { english: boolean; marca?: string; cuenta: CuentaNova | null }): string {
  return [
    "Eres NOVA, la asistente oficial de InnovationTECH Studio: experta en marketing digital, redes sociales y redacción publicitaria para pequeños negocios, y guía de la app Studio.",
    "Tu tono es moderno, cálido y breve. Conversa de forma natural; recuerda lo que ya se dijo en esta conversación y, cuando te pidan cambios, ajusta tu respuesta anterior en lugar de empezar de cero.",
    "Para dudas de cómo usar Studio, contesta con pasos cortos usando el manual de abajo. Para textos, entrégalos listos para publicar: concretos, persuasivos y adaptados a la red social. Usa Markdown (negritas, listas, títulos cortos) cuando ayude a leer.",
    "Si falta un dato importante (producto, público, oferta, red social), haz una sola pregunta breve antes de escribir.",
    "Nunca inventes precios, cifras, límites, testimonios, datos de clientes ni recuerdos. Solo usa los números de «Datos del plan» de abajo; si te preguntan un precio, límite o paquete que no aparece ahí, di que no tienes ese dato y sugiere revisarlo en Mi cuenta, sin dar ningún número.",
    "No recuerdas otras conversaciones: no digas que te acuerdas de algo que no está en esta.",
    "No expliques cómo está construida Studio por dentro (servidores, modelos, bases de datos, proveedores). No pidas datos sensibles (contraseñas, tarjetas, documentos). No prometas resultados (ventas, seguidores, alcance). No uses lenguaje engañoso.",
    "Cuando propongas imágenes, agrega al final hasta 3 líneas que empiecen con 'PROMPT DE IMAGEN:', cada una con la descripción de una imagen en inglés en una sola línea.",
    o.english ? "Write in English unless the user writes in another language." : "Responde en el idioma del usuario (por defecto, español).",
    `\n## Manual de Studio\n${MANUAL_STUDIO}`,
    `\n## Datos del plan\n${contextoCuenta(o.cuenta, o.english)}`,
    o.marca ? `\n## Marca del usuario (úsala siempre)\n${o.marca}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- Velocidad: qué modelo responde ----------

const ATAJOS: Record<string, Velocidad> = { studio: "rapida", plan: "rapida", comercial: "creativa", ideas: "creativa" };

// Sin acentos ni mayúsculas, para comparar
const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// «cómo» y «dónde» con acento, o al empezar la pregunta: «como» y «donde» sueltos son muy comunes en textos
// («escríbelo como un poema»). Lo mismo con «plan»: «mi plan» sí, «un plan de contenido» no.
const RAPIDA_CON_ACENTO = /\b(cómo|dónde)\b|(^|¿)\s*(cómo|dónde)/iu;
const RAPIDA = [
  /^\s*¿?\s*(como|donde)\b/,
  /\bque significa\b/,
  /\b(mi|tu|su|el|del) plan\b(?! de (contenido|publicaciones|marketing|redes))/,
  /\bplan (basico|pro|de prueba)\b/,
  /\bplanes\b/,
  /\blimites?\b/,
  /\bprecios?\b/,
  /\bcuant[oa]s?\b/,
  /\berror(es)?\b/,
  /\bno (funciona|sirve|carga|abre)\b/,
  /^\s*(how|where)\b/,
  /\bwhat does .+ mean\b/,
  /\b(limits?|prices?|pricing)\b/,
  /\bmy plan\b/,
  /\bnot working\b/,
];

export function elegirVelocidad(texto: string, atajo?: string): Velocidad {
  if (atajo && ATAJOS[atajo]) return ATAJOS[atajo];
  if (RAPIDA_CON_ACENTO.test(texto)) return "rapida";
  const t = normal(texto);
  return RAPIDA.some((r) => r.test(t)) ? "rapida" : "creativa";
}

// Modelo de Cloudflare: el que el cliente eligió en Configuración manda; el de siempre no cuenta como elegido.
export function modeloCloudflare(v: Velocidad, elegido?: string): { modelo: string; maxTokens: number } {
  const propio = elegido?.trim();
  if (propio && propio !== MODELO_CREATIVO) return { modelo: propio, maxTokens: 1800 };
  return v === "rapida" ? { modelo: MODELO_RAPIDO, maxTokens: 700 } : { modelo: MODELO_CREATIVO, maxTokens: 1800 };
}
