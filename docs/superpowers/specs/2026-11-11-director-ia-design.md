# Director con IA — órdenes escritas o por voz para crear y editar videos

Fecha: 2026-11-11 · Estado: aprobada por Hector (con el ajuste de 7 a 10 s por imagen y gastar lo mínimo)

## Qué pidió Hector

«Falta una función para que la IA me cree un video a través de órdenes, ya sea comandos de voz o con IA». Eligió: que **arme el video completo** desde una orden **y** que después **acepte órdenes para corregirlo**, en **las dos pestañas** de Videos. Regla de siempre: lo mejor al menor costo.

## Alcance

Dos entregas, cada una con su plan:

- **Entrega A (esta spec, completa):** Director en «Reel con mis imágenes».
- **Entrega B (solo esbozo aquí; tendrá su propia spec):** Director en «Editor de video + música». Ahí la IA no inventa el video: ordena, recorta y viste los videos que la persona sube.

El orden de trabajo queda: Director A → Editor entrega 2 → Director B → Editor entregas 3 y 4. «Armar desde el guion» (entrega 4 del editor) queda cubierto por el Director y se quita de esa entrega.

## Cómo se ve (entrega A)

Arriba del Creador de Reels, antes del paso 1, un bloque **«Director con IA»**:

- Un campo de texto («Dile a la IA qué video quieres o qué cambiar»), el botón de micrófono que la app ya tiene (`MicButton`) y **Enviar**.
- Tres ejemplos tocables: «Hazme un video de mi promoción de esta semana», «Pon todos los textos arriba y grandes», «Que dure 30 segundos con música alegre».
- Después de cada orden: una línea por cosa hecha («Agregué 6 clips», «Escribí los textos y el guion», «Puse música Alegre pop») y el botón **Deshacer orden**.
- Si la orden va a gastar imágenes o voz, antes de hacer nada aparece: «Esta orden usa 6 imágenes y 1 voz. **Hacerlo** / **Cancelar**». Sin gasto, se ejecuta directo.

El micrófono solo escucha mientras se toca; al terminar de dictar, el texto queda en el campo y la persona toca Enviar (así puede corregir lo dictado).

## Cómo funciona

1. La app manda a `/api/text` (modo nuevo `director`) la orden (máx. 500 caracteres) y un **resumen** del video: formato, número de clips y, por clip, número, tipo, segundos, si tiene foto y su texto; guion, voz elegida, si hay voz generada, música (estilo, volumen), negocio y llamada a la acción. **No se mandan imágenes.**
2. La IA responde SOLO un JSON: `{"acciones": [...], "mensaje": "texto corto"}`.
3. La app **valida** cada acción contra el catálogo (tipos, rangos, números de clip). Lo inválido se descarta y se avisa. Máximo 20 acciones por orden.
4. Las acciones se aplican con las mismas funciones de la línea de tiempo y los mismos ajustes que mueven los botones. Las que gastan (imágenes, voz) se ejecutan después de la confirmación.
5. Se muestra el resumen. **Deshacer orden** regresa clips y ajustes a como estaban antes (un nivel; los cambios de clips además quedan como un paso normal de Deshacer).

Si la IA no devuelve JSON válido o ninguna acción válida: «No entendí la orden. Dila de otra forma.», no se toca el video y se devuelve el texto gastado.

## Catálogo de acciones (entrega A)

Los clips se numeran desde 1, como en pantalla. `clip` acepta un número o `"todos"` donde se indica.

| Acción | Campos | Qué hace |
|---|---|---|
| `armar` | `tema`, `clips` (2–12, por defecto 4), `segundos_por_foto` (7–10, por defecto 8), `textos[]`, `imagenes[]` (descripciones en inglés), `cta`, `guion`, `musica` (estilo) | Reemplaza los clips vacíos y agrega los que falten; pone textos, cierre, guion y música. Pide crear una imagen por clip sin foto y generar la voz. |
| `agregar_clip` | `cantidad` (1–10) | Agrega clips al final |
| `borrar_clip` | `clip` | Borra ese clip |
| `mover_clip` | `clip`, `a` | Lo cambia de lugar |
| `duplicar_clip` | `clip` | Lo copia justo después |
| `duracion` | `clip` (número o todos), `segundos` (1.5–15) | Duración de la foto |
| `duracion_total` | `segundos` (5–120) | Reparte las fotos para que el video completo dure eso (las tomas con IA no cambian) |
| `texto` | `clip`, `texto` (máx. 120) | Cambia el texto en pantalla |
| `estilo_texto` | `clip` (número o todos), `posicion`, `tamano` | Posición y tamaño del texto |
| `imagen` | `clip`, `descripcion` | Crea con IA la imagen de ese clip (gasta 1 imagen) |
| `animar` | `clip`, `activar`, `movimiento` | Marca o desmarca la foto «con IA». **Nunca lanza la toma.** |
| `formato` | `valor` (9:16, 1:1, 16:9) | Formato del video |
| `cierre` | `negocio`, `cta` | Textos del cierre |
| `guion` | `texto` (máx. 1500) | Guion de la voz |
| `voz` | `genero` (mujer/hombre) o `voz` (id), `generar`, `quitar` | Elige voz, la genera (gasta 1 voz) o la quita |
| `subtitulos` | `activar` | Subtítulos de la voz |
| `musica` | `activar`, `estilo` (uno de los 20), `volumen` (0–100, `subir`, `bajar`) | Música de fondo |
| `vista_previa` | — | Abre la vista previa |
| `crear_video` | — | Graba el video sin IA (lo mismo que «Crear reel») |

Reglas:

- **Tomas con IA:** el Director nunca presiona «Generar con IA». Respeta el máximo de 4 por video.
- **Voz:** si el plan no incluye voz, la acción se omite y se avisa («Tu plan no incluye voz»); el resto de la orden sí se hace. Tras generar la voz en un `armar`, las fotos se reparten para cubrirla (`ajustarAVoz`).
- **Tope de 2 minutos:** si tras aplicar la orden el video pasa de 2:00, se aplica y se muestra el aviso de siempre.
- `armar` sobre un video que ya tiene fotos **no las borra**: conserva los clips con foto y completa el resto. Para empezar de cero, la persona usa «Empezar nuevo».

## Pocas imágenes, bien aprovechadas (pedido de Hector)

Al armar un video, cada foto dura **de 7 a 10 segundos** (8 por defecto). Así un video de 30 s usa 4 imágenes y no 10: se gasta menos y cada imagen se luce con su zoom lento. Reglas para `armar`:

- Número de clips = duración pedida ÷ 8, redondeado, entre 2 y 12. Sin duración pedida: 4 clips (unos 35 s con el cierre).
- El guion de voz se escribe a la medida de esa duración (unas 2.3 palabras por segundo) para que la voz quepa sin alargar el video.
- Las descripciones de imagen se piden detalladas (fotografía publicitaria, luz, encuadre, sin texto dentro) para que la imagen salga bien a la primera y no haya que repetirla.
- Los clips que la persona agrega a mano también empiezan en 8 s (pedido de Hector, 2026-11-11). Los borradores de antes del editor conservan su duración.

## Costo

- Cada orden: **1 texto** (misma cuenta que el asistente; gratis con Cloudflare propio). Una sola llamada: `armar` trae todo el contenido en la misma respuesta.
- Imágenes y voz: lo mismo que con los botones, siempre con confirmación previa.
- Dictado: el reconocimiento del navegador (gratis) o Whisper de Cloudflare como respaldo, igual que hoy.
- Sin costo nuevo de servidor ni dependencias nuevas.

## Piezas

- `lib/director.ts` (puro, con pruebas): tipos del catálogo, `resumenProyecto`, `validarAcciones(json, resumen)` → `{acciones, descartadas}`, `aplicarAcciones(estado, acciones)` → `{estado, pendientes, hecho[]}` donde `pendientes` son las acciones con gasto o de efecto (imágenes, voz, vista previa, crear video) y `hecho` las líneas del resumen; `costoDe(pendientes)`.
- `app/api/text/route.ts`: modo `director` (instrucciones con el catálogo, temperatura baja, respuesta JSON; devuelve el uso si falla).
- `app/director.tsx`: el bloque de pantalla (campo, micrófono, ejemplos, confirmación, resumen, deshacer).
- `app/reel-studio.tsx`: junta el estado (clips + ajustes), aplica el resultado y ejecuta los pendientes con las funciones que ya existen (`makeImage`, `makeVoice`, `verPrevia`, `buildReel`).
- `lib/locales/en.ts`: textos nuevos. La IA entiende órdenes en español e inglés.

## Errores

- Sin conexión o sin clave: el mensaje normal de textos.
- Sin saldo de textos: el mensaje normal de cuota con la invitación a planes.
- Número de clip que no existe: esa acción se descarta y se dice («No existe el clip 9»).
- Falla al crear una imagen o la voz: lo demás queda hecho; se muestra qué faltó.
- Orden mientras la app está ocupada (grabando, generando): el botón Enviar está apagado.

## Privacidad

La orden y los textos del video van al mismo proveedor de textos que ya usa la app (Cloudflare Workers AI o Claude con clave propia). No se agregan proveedores ni se mandan fotos. No requiere cambio en la política de privacidad.

## Pruebas

- Unidad (`lib/director.test.ts`): validación de cada acción (rangos, clip inexistente, tope de 20, campos de más), aplicación (cada acción sobre una lista de clips y ajustes), `armar` conserva fotos, voz sin plan, costo de pendientes, JSON basura.
- Ruta: el modo `director` arma las instrucciones y lee JSON envuelto en texto.
- Navegador (con `/api/text` simulado): orden de edición sin gasto, orden `armar` con confirmación y cancelación, Deshacer orden, celular 390 px.
- Hector prueba con IA real y por voz en la versión de prueba.

## Fuera de alcance (entrega A)

- Escucha continua o palabra de activación («oye Studio»).
- Que la IA vea las fotos o el video para decidir.
- Lanzar tomas con IA de pago desde una orden.
- Conversación de varios turnos con memoria (cada orden se entiende sola, con el resumen del video).
- Órdenes en el Editor de video + música (entrega B).

## Esbozo de la entrega B

Mismo bloque y misma ruta, con otro catálogo sobre el proyecto del Editor de video: ordenar clips, recortar inicio/fin, dividir, quitar, transiciones, relleno, formato, textos, música y volumen, y «arma mi video» (ordena lo subido, pone transiciones, un texto de entrada y música). Se diseña en detalle después de la entrega 2 del editor, porque comparte piezas con ella.
