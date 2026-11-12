# Editor de video con línea de tiempo (Creador de Reels)

Fecha: 11 de noviembre de 2026 · Diseñado con Hector en la conversación del 10–11 de noviembre. Aprobó la **opción A** (convertir el Creador de Reels en editor) y la parte 1 («ok aprobado»); para las partes 2 y 3 dio la regla «lo mejor al menor costo, con las funciones que realmente se necesitan». El 11 de noviembre pidió además una **cámara que grabe video dentro de Studio** y que el **sonido de esos videos se oiga** en el video final, con opción de apagarlo por clip.

## Para qué

Hoy el Creador de Reels arma un video de fotos en orden fijo, con hasta 4 tomas con IA. Hector quiere poder **arreglar el video después de generarlo** sin empezar de cero ni pagar de más:

1. Cambiar el orden de las tomas.
2. Rehacer **una sola** toma, o sustituirla por otro video (uno propio, uno de la galería u otra toma con IA).
3. Alargar el video hasta **2 minutos** usando poca IA.

Es para él y para sus clientes de Studio, en celular y en computadora por igual. El resultado sigue siendo un video corto para redes.

**Regla del proyecto:** ningún costo nuevo por video. Lo único que cuesta son las tomas con IA que el cliente decida generar (≈ $0.20 cada una con el modelo actual).

## Decisiones aprobadas

| Tema | Valor |
|---|---|
| Dónde vive | En el Creador de Reels: el paso «2. Escenas» pasa a ser la línea de tiempo |
| Pistas | Una sola pista de video (sin capas encimadas) |
| Tipos de clip | Foto (zoom y paneo), toma con IA (5 s), video propio |
| Duración máxima | 2 minutos, contando el cierre con la marca |
| Duración de una foto | De 1.5 a 15 s, elegida por clip |
| Tomas con IA distintas por video | Hasta 8 (cada una cuenta contra la cuota del mes) |
| Estirar una toma | Normal 5 s · cámara lenta 10 s · ida y vuelta 10 s · repetir ×2 o ×3 |
| Video propio | Subido del dispositivo, de la galería de Studio o **grabado con la cámara dentro de Studio**; máx. 100 MB; se queda en el dispositivo |
| Sonido de los videos propios | **Se oye en el video final**, mezclado con la voz y la música; cada clip tiene un interruptor para apagarlo |
| Exportar | En el navegador, en tiempo real (2 min de video = 2 min de espera), MP4 |
| Vista previa | Reproduce la línea de tiempo sin grabar |
| Proyecto | Se guarda solo en el dispositivo |
| Precios de los planes | No cambian |
| Dividir un clip | Parte un video (o una toma) en dos en el punto elegido |
| Deshacer / rehacer | Hasta 50 pasos, mientras la pantalla siga abierta |
| Volúmenes | Tres controles: voz en off, música y sonido de los clips |
| Velocidad de un video propio | ×0.5, ×1, ×1.5 o ×2 |
| Texto de cada clip | Posición (arriba, centro, abajo) y tamaño (chico, normal, grande) |
| Proyectos | Varios guardados en el dispositivo (hasta 20), con nombre |
| Congelar un cuadro | Saca una foto de un momento de un video y la agrega como clip de foto |
| Armar desde el guion | La IA de texto propone clips, duración y texto (cuenta 1 texto) |
| Portada | Elegir un cuadro del video y descargarlo como imagen |

## Qué queda fuera (a propósito)

Varias pistas o capas encimadas; filtros y corrección de color (ya existe el Editor de imágenes); transiciones elaboradas (se queda el fundido actual); armar el video en un servidor (costaría por video); videos de más de 2 minutos.

## Cómo se ve

Una fila horizontal de clips, de izquierda a derecha, con desplazamiento lateral. Cada clip muestra miniatura, tipo (Foto / IA / Video) y duración. Arriba de la fila: duración total («0:42 de 2:00»), **Deshacer** y **Rehacer**, y el botón **Vista previa**. Junto al título, el nombre del proyecto con un menú para cambiar de proyecto, crear uno nuevo, renombrar o borrar.

Al tocar un clip se abre su panel debajo de la fila:

- **Todos:** mover ← →, duplicar, borrar, texto en pantalla con su posición y tamaño.
- **Foto:** duración (1.5 a 15 s), «Animar con IA» (la convierte en toma), «Sustituir por…».
- **Toma con IA:** movimiento, «Rehacer con IA», «Volver a la anterior» (si hay una), cómo se reproduce (normal, lenta, ida y vuelta, repetir), recorte de inicio y fin, «Sustituir por…».
- **Video propio:** recorte de inicio y fin, **dividir**, **velocidad**, interruptor **Sonido** (encendido por defecto), **congelar cuadro**, «Sustituir por…».

En computadora los clips también se arrastran para reordenar. En celular se reordenan con ← → (arrastrar con el dedo choca con el desplazamiento de la página).

Al final de la fila, **«＋ Agregar»**: subir foto, tomar foto (cámara), de mi galería, crear con IA, subir video, **grabar video (cámara)**.

Lo que no cambia: tema e ideas con IA, formato, voz, subtítulos, música, marca, cierre.

## Modelo de datos

`lib/linea-tiempo.ts` (lógica pura, sin pantalla):

```ts
type Reproduccion = "normal" | "lenta" | "ida_vuelta" | "repetir2" | "repetir3";

type Clip = {
  id: string;
  tipo: "foto" | "toma" | "video";
  caption: string;
  imagen: string;            // la foto (foto y toma) o el cuadro de portada (video)
  prompt?: string;           // descripción para «Crear con IA» de la foto
  segundos?: number;         // solo foto: 1.5 a 15
  // toma con IA
  movimiento?: string;
  trabajoId?: string;        // el trabajo de video con IA que la generó (sirve para volver a pedir el enlace)
  anteriorTrabajoId?: string;// la toma previa, para «Volver a la anterior»
  variacion?: number;        // cambia al «Rehacer» con el mismo movimiento
  reproduccion?: Reproduccion;
  // video propio
  archivoId?: string;        // el archivo guardado en el dispositivo (media-store)
  duracionOriginal?: number; // segundos del archivo o de la toma (5)
  sinSonido?: boolean;       // solo video propio: true = no se oye en el video final
  velocidad?: number;        // solo video propio: 0.5, 1, 1.5 o 2 (por defecto 1)
  textoPos?: "arriba" | "centro" | "abajo"; // por defecto, abajo (como hoy)
  textoTam?: "chico" | "normal" | "grande"; // por defecto, normal
  // toma y video
  inicio?: number;           // recorte, en segundos del original
  fin?: number;
};
```

Funciones puras, todas con pruebas:

- `duracionClip(clip)`: foto = `segundos`; video = `(fin − inicio) ÷ velocidad`; toma = `(fin − inicio) × factor` (lenta ×2, ida y vuelta ×2, repetir ×2 o ×3).
- `duracionTotal(clips, cierre)` y `validar(clips, cierre)`: errores claros si pasa de 120 s, si una foto queda fuera de 1.5–15 s, si un recorte queda de menos de 1 s, o si hay más de 8 tomas distintas.
- `mover(clips, de, a)`, `duplicar(clips, i)`, `borrar(clips, i)`, `sustituir(clips, i, nuevo)`.
- `recortar(clip, inicio, fin)`: acota al original y a un mínimo de 1 s.
- `dividir(clips, i, segundo)`: parte el clip `i` (video o toma) en dos clips seguidos con el mismo archivo o `trabajoId` y recortes contiguos; no divide si alguna mitad quedaría de menos de 1 s. Las dos mitades de una toma cuentan como una sola toma.
- `historial`: `crear(estado)`, `anotar(h, estado)`, `deshacer(h)`, `rehacer(h)`; máximo 50 pasos; anotar después de deshacer descarta lo «rehacible».
- `aEscenas(clips)`: lo que necesita el motor para dibujar (ver abajo).
- `desdeEscenasViejas(scenes)`: convierte el borrador actual (`reel:escenas`) para que nadie pierda su trabajo.

Un clip **duplicado** de una toma comparte el mismo `trabajoId`: no se vuelve a pagar. Las «8 tomas distintas» se cuentan por `trabajoId` (o por foto + movimiento + variación si todavía no se genera).

## El motor (`lib/reel.ts`)

Hoy `renderReel` recibe `images`, `clips` y `duracion`, y reparte el tiempo con `planDeEscenas`. Se agrega una entrada explícita que manda sobre las anteriores:

```ts
type EscenaRender = {
  imagen: string;        // foto, o respaldo si el video no carga
  texto: string;
  textoPos: "arriba" | "centro" | "abajo";
  textoTam: "chico" | "normal" | "grande";
  segundos: number;      // lo que dura en pantalla
  video?: { src: string; inicio: number; fin: number; velocidad: number; idaVuelta: boolean; repeticiones: number; sonido: boolean };
};
ReelOptions.escenas?: EscenaRender[];   // si viene, define el video completo
ReelOptions.soloVista?: boolean;        // reproduce en el lienzo de vista previa sin grabar
ReelOptions.volumenes?: { voz: number; musica: number; clips: number }; // de 0 a 1; por defecto 1, 1 y 1
```

- La lista de tiempos (`durs`, `starts`) sale de `escenas[i].segundos`. El cierre de 3 s se agrega si el total no pasa de 120 s.
- Escena con `video`: se reproduce desde `inicio`; cámara lenta con `playbackRate = 0.5`; repetir = volver a `inicio` al llegar a `fin`; ida y vuelta = al llegar a `fin`, retroceder moviendo `currentTime` cuadro por cuadro.
- **Sonido de un clip:** si `sonido` es true, el audio del video entra a la mezcla que ya graba el motor (la misma donde van la voz y la música) solo mientras dura su escena, con un fundido corto al entrar y al salir para que no truene. Mientras suena un clip, la música baja de volumen igual que cuando hay voz en off. Las tomas con IA no llevan sonido.
- Si un video no carga, la escena usa su imagen con zoom (como hoy cuando falla un clip).
- `soloVista`: el mismo ciclo de dibujo, sin `MediaRecorder` ni codificación; se puede detener.
- El selector «Duración del video» desaparece en la entrega 1: la duración es la suma de los clips. La pantalla siempre llama al motor con `escenas`; el camino viejo (`images` + `duracion` + `clips`) se retira en esa misma entrega junto con su reparto automático (`lib/reel-escenas.ts` queda solo con lo que la línea de tiempo siga usando).

**Riesgo conocido — ida y vuelta.** Retroceder un video moviendo `currentTime` no es fluido en todos los navegadores (sobre todo en celulares). Se prueba al llegar a la entrega 3; si no se ve bien, se entrega sin «ida y vuelta» y se avisa a Hector. Cámara lenta y repetir no tienen ese riesgo.

## Extras de edición

- **Volúmenes.** Tres deslizadores en el paso de audio. Se aplican en la mezcla del motor; la música sigue bajando sola cuando hay voz o sonido de un clip, sobre el volumen elegido.
- **Velocidad.** `playbackRate` del video; el sonido del clip se acelera o alenta con él (a ×0.5 y ×2 se oye distinto: se avisa en el panel).
- **Congelar un cuadro.** En el panel de un video, un deslizador elige el momento; «Usar este cuadro» lo dibuja en un lienzo, lo guarda como JPG (en la galería, como las fotos de la cámara) y lo inserta como clip de foto después del video. Desde ahí se puede animar con IA.
- **Portada.** En el resultado, «Elegir portada»: un deslizador sobre el video terminado y «Descargar portada» (JPG al tamaño del video).
- **Armar desde el guion.** Botón junto a «Sugerir ideas»: manda el tema (y el guion de la voz, si hay) a la ruta de textos que ya existe y recibe una lista `{ titulo, texto, segundos, descripcionDeImagen }` (de 3 a 12 elementos, sumando como máximo 110 s). Crea esos clips de foto **vacíos** con su texto, duración y descripción para «Crear con IA»; no genera imágenes ni tomas por su cuenta. Si ya hay clips, pregunta antes de reemplazarlos (y se puede deshacer).
- **Proyectos.** Cada proyecto guarda nombre, clips, formato, voz elegida, guion, música y volúmenes. El borrador actual se convierte en el primer proyecto («Mi video»). Borrar un proyecto borra sus videos propios que ningún otro proyecto use.

## Tomas con IA por clip

Se reutiliza todo lo de `lib/video-ia.ts`, `lib/video-ia-cliente.ts` y `/api/video-ia`.

- **Animar / Rehacer:** sube la foto (si no está subida), pide **una** toma y consulta hasta que termine; al terminar guarda `trabajoId` en el clip. Solo ese clip muestra el estado («En fila», «Generando…»); el resto del editor sigue usable.
- **Rehacer con el mismo movimiento:** hoy el caché devolvería el mismo clip. Se agrega `variacion` (entero ≥ 0) al pedido de cada toma y a la llave del caché; «Rehacer» manda `variacion + 1`. Así se genera un clip nuevo y cuesta 1 toma. Sin `variacion` (o con 0) todo sigue igual que hoy.
- **Volver a la anterior:** intercambia `trabajoId` y `anteriorTrabajoId`. No cuesta.
- **Enlaces que caducan:** el enlace del clip dura 1 hora. Antes de la vista previa o de exportar, el editor pide enlaces frescos con `GET /api/video-ia?ids=…` (ya devuelve `clipUrl` para las tomas listas).
- **Tope por pedido:** el servidor sigue aceptando hasta 4 tomas por pedido; el editor pide de una en una.

## Videos propios

- Se eligen del dispositivo (`<input type="file" accept="video/*">`) o de la galería de Studio (los `kind: "video"`).
- Se guardan en el dispositivo con `media-store` (`putFile` / `getFile`), igual que los videos de la galería. No se suben a ningún servidor.
- Al agregarlos se leen su duración y un cuadro de portada. Máximo 100 MB; si pesa más o el navegador no puede abrirlo, mensaje claro.
- Si el archivo ya no está (otro dispositivo, almacenamiento borrado), el clip aparece como «Falta el archivo» con el botón «Sustituir».
- **Grabar con la cámara:** el cuadro de cámara que ya existe en Imágenes (`app/camara.tsx`) gana un modo video: vista en vivo, cambiar de cámara, botón de grabar con contador de tiempo y de detener. Graba imagen y sonido (pide permiso de cámara y micrófono), con un máximo de 60 s por grabación. Al detener, se puede repetir o usar; el video queda guardado en la galería de Studio y entra como clip.
- **Sonido:** se oye en el video final salvo que el cliente lo apague en ese clip (ver «El motor»). Si el cliente niega el micrófono, se graba sin sonido y se avisa.

## Guardado

Los proyectos se guardan en el dispositivo (`reel:proyectos` y `reel:proyecto-activo`); las fotos, como hoy; los videos propios, en `media-store`. «Empezar nuevo» crea un proyecto en blanco y deja los demás como están. El historial de deshacer vive solo en memoria: se pierde al recargar.

## Errores

| Situación | Qué ve el cliente |
|---|---|
| Pasa de 2 minutos | «Tu video dura 2:14. El máximo es 2:00: quita o acorta algún clip.» No deja exportar |
| Sin tomas disponibles | El mensaje actual de cuota (comprar paquete Video / esperar al día 1) |
| La toma falla | El clip vuelve a ser foto con zoom; «No se pudo generar la toma, te devolvimos tu crédito» |
| Video muy pesado o ilegible | «Ese video pesa más de 100 MB» / «Este video no se puede abrir en tu navegador» |
| Falta el archivo de un video | Clip marcado «Falta el archivo» + «Sustituir» |
| Sin permiso de cámara o micrófono | El mensaje claro que ya da la cámara de fotos; sin micrófono se ofrece grabar sin sonido |
| IA de video en pausa | Los botones de IA se apagan con el aviso actual; el resto del editor funciona |

## Entregas

Cada una se publica en la versión de prueba y Hector la prueba antes de la siguiente.

1. **Línea de tiempo.** Modelo de clips, fila de clips, mover / duplicar / borrar, duración por foto, total hasta 2 min, **deshacer y rehacer**, **texto con posición y tamaño**, motor con `escenas`, vista previa sin grabar, migración del borrador viejo. Las tomas con IA siguen funcionando como hoy: se marcan por clip y se generan todas juntas al tocar «Generar con IA», con el tope actual de 4 por video (el de 8 llega en la entrega 3, cuando se piden de una en una).
2. **Videos propios, cámara y sonido.** Subir video, usar los de la galería, **grabar con la cámara de Studio**, recorte de inicio y fin, **dividir**, **velocidad**, **sonido del clip con interruptor**, **volúmenes**, **congelar un cuadro**, «Sustituir por…». En «Videos» el botón de grabar aparece desde esta entrega, porque antes un video grabado no tendría dónde usarse.
3. **IA por clip y estirar.** Animar y rehacer un solo clip, `variacion`, «Volver a la anterior», tope de 8, cámara lenta, repetir e ida y vuelta (con la prueba de fluidez).
4. **Proyectos y ayudas.** Varios proyectos, **armar desde el guion** y **portada del video**.

## Pruebas

- **Automáticas (node:test):** todo `lib/linea-tiempo.ts` (duraciones con velocidad, validación, mover, duplicar, recortar, dividir, historial de deshacer, conversión a escenas, migración), el guardado de proyectos y la lectura de la propuesta «desde el guion» y el cambio de `variacion` en `lib/video-ia.ts` (llave del caché distinta; sin variación, igual que hoy).
- **En navegador (Chrome con Playwright):** exportar un video con foto + video propio recortado y comprobar la duración; grabar con cámara y micrófono simulados y comprobar que el archivo final trae pista de audio (y que no la trae del clip al apagar su sonido); cámara lenta y repetir con un clip de prueba midiendo lo que se ve en el lienzo; vista previa sin grabar.
- **Con Hector, en la versión de prueba:** cada entrega en celular y computadora; la entrega 3 con una toma real.
