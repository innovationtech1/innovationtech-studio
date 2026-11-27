# Creador guiado de video con NOVA — diseño

Fecha: 2026-11-27 · Aprobado por Hector en conversación (partes 1, 2 y 3).

## Objetivo

Que una persona sin experiencia llegue de «tengo unas fotos» a un video completo sin perderse:
llena unos datos, NOVA arma el video y luego lo ajusta en el editor. Hoy todo vive junto en
«Creador de Reels» y hay que saber qué tocar.

Éxito: alguien que abre Videos por primera vez termina un video con voz que corresponde a cada
foto, sin ayuda externa y sin quedarse atorado en ningún fallo.

## Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Enfoque | Creador guiado de video primero; el editor de fotos queda como proyecto siguiente |
| Resultado | Borrador: el video armado se abre en el editor actual para ajustar |
| Guion | NOVA ve las fotos, escribe una línea por foto y la persona corrige antes de grabar la voz |
| Movimiento | Todas las fotos con movimiento simple (gratis); la persona marca cuáles animar con IA |
| Lugar | Opción A: entrada a Videos con dos botones; el editor avanzado no cambia |
| Guía | NOVA acompaña cada paso con avatar, texto y, si está activada, voz |

## Parte 1 — Pasos y papel de NOVA

Entrada a Videos: «Crear video con NOVA» (camino guiado) y «Editor avanzado» (pantalla actual).

En cada paso, arriba, el avatar de NOVA (`app/nova-avatar.tsx`) con una instrucción corta. Con la
voz de NOVA activada también la dice (`lib/nova-voz.ts`).

1. **Fotos.** «Sube las fotos de tu video, en el orden en que quieres que salgan.» Subir o elegir de
   Galería y ordenar. De 2 a 8 fotos (`MIN_FOTOS_VIDEO`, `MAX_FOTOS`). Aviso: «NOVA va a ver tus fotos
   para escribir el guion. No se guardan.»
2. **De qué trata.** «Cuéntame en una frase de qué es el video.» Texto o dictado. Formato (vertical por
   defecto) y duración (`DURACIONES_SECUENCIA`: 10, 15, 20 o 30 s), ya puestos para confirmar.
3. **Guion.** «Vi tus fotos y escribí lo que voy a decir en cada una. Cambia lo que no te guste.» Cada
   foto con su línea editable; elegir voz; casilla «Animar con IA» por foto, con cuántas tomas quedan.
4. **Armar.** NOVA dice en qué va (voz, fotos, animación). Al terminar abre el editor con todo puesto:
   «Listo. Revísalo y cambia lo que quieras, o descárgalo.»

Comportamiento:

- Se puede regresar a un paso anterior sin perder lo escrito.
- Si se cierra la app a la mitad, al volver NOVA ofrece continuar donde se quedó (etapa 3).
- «Empezar de nuevo» siempre disponible; pregunta antes de borrar.

## Parte 2 — Visión, privacidad y límites

Cómo ve las fotos:

1. El teléfono hace una copia pequeña de cada foto (la original no se toca).
2. La copia va al servidor de Studio y de ahí al modelo de visión de Cloudflare Workers AI
   (`@cf/meta/llama-3.2-11b-vision-instruct`; confirmar disponibilidad al construir la etapa 2).
   Devuelve una descripción corta por foto.
3. Con la frase del paso 2, las descripciones y Mi marca, se escribe una línea por foto con el modo
   `guion_secuencia` que ya existe en `/api/text` (las descripciones entran como `momentos`).

Privacidad:

- Studio no guarda las copias; solo se usan para describir en ese momento.
- La política de privacidad vigente ya cubre el envío de fotos a Cloudflare para generar contenido.
- La instrucción al modelo pide describir la escena, sin identificar personas ni adivinar nombre,
  edad u otros datos de quien salga.

Conteo en los planes:

- Ver fotos + escribir guion = 1 texto del mes. Voz = 1 voz. Cada foto animada = 1 toma con IA.
- Con Cloudflare propio conectado, corre en la cuenta de la persona.
- Tope diario de análisis por negocio, para evitar abusos.
- Una operación que falla no se descuenta.

Sin callejones sin salida:

- Cada operación tiene tiempo máximo; al pasarse se corta sola.
- Un reintento automático antes de avisar.
- Si falla, NOVA explica en palabras simples y siempre ofrece: «Intentar otra vez», «Seguir sin
  esto» (sin voz o sin animación) o «Empezar de nuevo».
- Un fallo nunca borra fotos, frase ni guion corregido.
- Si un paso tarda más de lo normal aparece «Volver a empezar este paso» sin esperar a que termine.
- Si no se puede ver una foto (fallo, tardanza, licencia sin aceptar), esa línea queda vacía y NOVA
  pide «Cuéntame qué se ve en esta foto». El video se puede terminar aunque la visión falle del todo.

Tarea única de Hector: aceptar la licencia de Meta del modelo de visión en su cuenta de Cloudflare.

## Parte 3 — Entregas

1. **Camino guiado sin visión.** Los dos botones, los 4 pasos con NOVA y el armado que abre el editor.
   La persona escribe una línea corta por foto.
2. **NOVA ve las fotos.** Análisis de imágenes, guion automático, reintentos, tiempos máximos y
   botones de volver a empezar.
3. **Pulido.** Continuar donde se quedó, voz de NOVA leyendo instrucciones, inglés completo y ajustes
   de las pruebas.

Cada etapa: pruebas automáticas primero, sitio de pruebas, y Hector presiona Merge.

## Fuera de alcance

- Editor de fotos más completo (proyecto siguiente).
- Cambios al editor avanzado de video.
- Compras o precios dentro del camino guiado (en la app de Google Play no se venden planes).

## Piezas que se reutilizan

`app/reel-studio.tsx` (editor y armado), `app/secuencia-fotos.tsx` y `lib/secuencia*.ts` (fotos y
momentos), tarjeta «Video de NOVA» (guion y voz), `/api/text` modo `guion_secuencia`, `/api/voice`,
`/api/video-ia` (tomas), `lib/limite.ts` y `lib/guardado.ts` (límites y guardado).
