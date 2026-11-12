# Editor de video · Entrega 2 (videos propios, cámara y sonido) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un clip de la línea de tiempo pueda ser un video propio (subido, de la galería o grabado con la cámara de Studio), con recorte, dividir, velocidad, sonido con interruptor, volúmenes y congelar un cuadro.

**Architecture:** El modelo de clips (`lib/linea-tiempo.ts`) gana el tipo `video` y sus operaciones puras. El motor (`lib/reel.ts`) reproduce un tramo de video por escena y mezcla su sonido con la voz y la música. Los archivos viven en el dispositivo (`lib/media-store.ts`); un módulo nuevo (`lib/video-propio.ts`) los valida, guarda y abre. La cámara (`app/camara.tsx`) gana el modo video. La pantalla se arma en `app/linea-tiempo.tsx` y `app/reel-studio.tsx`.

**Tech Stack:** Next.js 15, React, TypeScript, lienzo 2D, Web Audio, MediaRecorder, IndexedDB, `node:test` con `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-11-editor-video-design.md` (secciones «Modelo de datos», «El motor», «Extras de edición», «Videos propios», «Errores» y la entrega 2 de «Entregas»).

## Global Constraints

- Video propio: máximo **100 MB**; se queda en el dispositivo, nunca se sube a un servidor.
- Grabación con la cámara de Studio: máximo **60 s**, con cámara y micrófono; sin permiso de micrófono se graba sin sonido y se avisa.
- Recorte: cada tramo dura **1 s como mínimo**. Dividir no deja mitades de menos de 1 s.
- Velocidad de un video propio: **×0.5, ×1, ×1.5 o ×2**. Duración en pantalla = `(fin − inicio) ÷ velocidad`.
- El sonido de un video propio **se oye en el video final** salvo que se apague en ese clip. Las tomas con IA no llevan sonido.
- Tres volúmenes de 0 a 1: voz, música y sonido de los clips (por defecto 1, el de música que ya existe, y 1). La música baja sola mientras suena la voz **o** el sonido de un clip.
- El tope de 2 minutos y el máximo de 4 tomas con IA no cambian. Ningún costo nuevo; sin dependencias nuevas.
- Textos visibles en español con traducción en `lib/locales/en.ts`. TDD: cada prueba se ve fallar antes de implementar.
- Fuera de esta entrega: IA por clip, estirar tomas, proyectos, portada, filtros, capas.

## Review Focus

1. **Falta el archivo** (almacenamiento borrado, otro dispositivo): el clip se muestra «Falta el archivo», no cuenta para exportar con video (usa su portada con zoom) y ofrece «Sustituir». → pruebas en Task 1 (`aEscenas` sin fuente) y Task 6.
2. **Video sin duración conocida** (los grabados en el navegador a veces no la traen): se mide buscando el final; nunca queda en 0 ni en infinito. → Task 3.
3. **Recorte y velocidad juntos:** 10 s recortados a 2–8 a ×2 duran 3 s; dividir a la mitad da dos clips de 1.5 s con recortes contiguos. → pruebas en Task 1.
4. **Sonido que truena o se queda pegado:** el sonido de un clip entra y sale con fundido corto y se corta al terminar su escena, también al detener la vista previa. → Task 2 y Task 7.
5. **Borrar y deshacer con archivos grandes:** borrar un clip de video no borra el archivo mientras pueda deshacerse; los archivos huérfanos se limpian al abrir la app y en «Empezar nuevo». → Task 3 y Task 6.

---

### Task 1: Clips de video en el modelo (`lib/linea-tiempo.ts`)

**Files:**
- Modify: `lib/linea-tiempo.ts`, `lib/linea-tiempo.test.ts`

**Interfaces:**
- Produces:

```ts
export const MIN_TRAMO = 1;                       // segundos mínimos de un recorte
export const VELOCIDADES = [0.5, 1, 1.5, 2] as const;
export type Clip = /* lo de hoy, y además */ {
  tipo: "foto" | "toma" | "video";
  archivoId?: string;        // video: dónde está el archivo (ver Task 3)
  duracionOriginal?: number; // video: segundos del archivo
  inicio?: number; fin?: number;   // video: recorte, en segundos del original
  velocidad?: number;        // video: 0.5, 1, 1.5 o 2 (por defecto 1)
  sinSonido?: boolean;       // video: true = no se oye en el video final
};
export type VideoRender = { src: string; inicio: number; fin: number; velocidad: number; sonido: boolean };
export type EscenaRender = /* lo de hoy, pero */ { video?: VideoRender };   // antes era string
export function clipDeVideo(datos: { archivoId: string; duracion: number; portada: string }): Clip; // recorte completo, ×1, con sonido
export function tramo(c: Clip): { inicio: number; fin: number };           // recorte acotado al original
export function recortar(clips: Clip[], i: number, inicio: number, fin: number): Clip[];
export function dividir(clips: Clip[], i: number, segundo: number): Clip[]; // `segundo` en tiempo del original
export function sustituir(clips: Clip[], i: number, nuevo: Clip): Clip[];   // conserva id, texto, posición y tamaño
export function aEscenas(clips: Clip[], fuentes?: { tomas?: Record<string, string | null | undefined>; videos?: Record<string, string | null | undefined> }): EscenaRender[];
```

`duracionClip` de un video = `(fin − inicio) ÷ velocidad`. `image` de un clip de video es su cuadro de portada. `fuentes.tomas` va por id de clip; `fuentes.videos` por `archivoId`.

- [ ] **Step 1: Pruebas que fallan:**
  - `clipDeVideo({archivoId:"v1", duracion: 12.4, portada:"data:p"})` → `tipo "video"`, `inicio 0`, `fin 12.4`, `velocidad 1`, `sinSonido` falso, `image "data:p"`.
  - `duracionClip`: video 0–10 a ×1 → 10; recortado 2–8 a ×2 → 3; a ×0.5 → 12; sin `image` igual cuenta (un video siempre tiene portada); `duracionOriginal` 0 o ausente → 0.
  - `recortar`: acota a `[0, duracionOriginal]`; si el tramo queda de menos de 1 s lo estira hasta 1 s sin salirse; sobre una foto → la misma lista.
  - `dividir(clips, i, 5)` sobre un video 2–8 → dos clips seguidos `2–5` y `5–8`, ids distintos, mismo `archivoId`, el texto solo en el primero; en `2.5` (mitad de 0.5 s) → la misma lista; sobre foto o toma → la misma lista.
  - `sustituir`: el clip nuevo queda en el lugar `i` con el `id`, `caption`, `textoPos` y `textoTam` del anterior.
  - `duplicar` de un video conserva `archivoId` (el archivo no se copia).
  - `validar`: recorte de menos de 1 s → «Un video quedó de menos de 1 segundo: alarga su recorte.»; el total cuenta los videos con su velocidad.
  - `aEscenas`: video con `fuentes.videos[archivoId]` → `video: {src, inicio, fin, velocidad, sonido: true}` y `segundos` = duración en pantalla; con `sinSonido` → `sonido: false`; sin fuente → sin `video` (se verá la portada con zoom); toma con `fuentes.tomas[id]` → `video: {src, inicio: 0, fin: 5, velocidad: 1, sonido: false}`.
  - `normalizarClips` conserva los campos de video y descarta valores imposibles (`velocidad: 7` → 1; `fin` menor que `inicio` → recorte completo).
  - `ajustarAVoz` no toca los videos y los descuenta del tiempo a repartir.
- [ ] **Step 2:** Run: `node --conditions=react-server --import tsx --test lib/linea-tiempo.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** Run → PASS. Ajustar `lib/director.ts` (`resumenProyecto` dice `tipo: "video"` y sus segundos; `duracion` y `duracion_total` no tocan videos y los descuentan) con su prueba.
- [ ] **Step 5: Commit** `git commit -m "Editor de video: clips de video en el modelo (recortar, dividir, velocidad, sustituir)"`

---

### Task 2: El motor reproduce tramos de video y mezcla su sonido (`lib/reel.ts`)

**Files:**
- Modify: `lib/reel.ts`
- Create: `lib/reel-sonido.ts`, `lib/reel-sonido.test.ts`

**Interfaces:**
- Consumes: `EscenaRender`, `VideoRender` (Task 1).
- Produces:

```ts
// lib/reel-sonido.ts (puro)
export const FUNDIDO = 0.15;                                   // segundos de entrada y salida del sonido de un clip
export function gananciaClip(t: number, dura: number): number; // 0→1 en el fundido de entrada, 1, 1→0 en el de salida; fuera del clip, 0
export function tramosConSonido(escenas: { segundos: number; video?: { sonido: boolean } }[]): { desde: number; hasta: number }[]; // tramos seguidos se juntan
// lib/reel.ts
export type ReelOptions = /* lo de hoy, y además */ { volumenes?: { voz: number; clips: number } }; // la música usa music.volume como hoy
```

- [ ] **Step 1: Pruebas que fallan** (`lib/reel-sonido.test.ts`): `gananciaClip(0, 4)` → 0; `(0.075, 4)` → 0.5; `(2, 4)` → 1; `(3.925, 4)` → 0.5; `(4.1, 4)` → 0; clip de 0.2 s nunca pasa de 1 ni truena (pico en el centro). `tramosConSonido` con `[foto 3, video con sonido 4, video con sonido 2, video sin sonido 5]` → `[{desde: 3, hasta: 9}]`; sin videos → `[]`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** implementar `lib/reel-sonido.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5: Motor.**
  - `loadClip` deja de forzar `muted` cuando la escena lleva sonido; al entrar a una escena con video: `currentTime = inicio`, `playbackRate = velocidad`, `play()`; al salir o al llegar a `fin`: `pause()`.
  - Sonido: por cada video con `sonido`, un `MediaElementAudioSourceNode` → `GainNode` → la misma salida que la voz y la música (la grabación o las bocinas). En cada cuadro la ganancia es `gananciaClip(local, segundos) × volumenes.clips`. Los videos sin sonido y las tomas quedan `muted`.
  - `volumenes.voz` multiplica la voz. La música baja al 35 % también durante `tramosConSonido` (misma rampa que con la voz).
  - Si el video no carga, la escena usa su imagen con zoom (como hoy).
  - Al terminar o abortar: pausar todos los videos y cerrar el audio.
- [ ] **Step 6:** Run: `npx tsc --noEmit && npm test` → en verde (los llamados de `app/reel-studio.tsx` se ajustan en Task 6; hasta entonces `aEscenas(clips, { tomas })`).
- [ ] **Step 7: Commit** `git commit -m "Editor de video: el motor reproduce videos recortados y mezcla su sonido"`

---

### Task 3: Guardar y abrir videos propios (`lib/video-propio.ts`, `lib/media-store.ts`)

**Files:**
- Create: `lib/video-propio.ts`, `lib/video-propio.test.ts`
- Modify: `lib/media-store.ts`

**Interfaces:**
- Produces:

```ts
// lib/video-propio.ts
export const MAX_VIDEO_MB = 100;
export function revisarArchivo(a: { size: number; type: string }): string | null;  // null = se puede usar
export function idDeArchivo(origen: "dispositivo" | "galeria", id: string): string; // "reelvid-<id>" o "gal:<id>"
export function huerfanos(guardados: string[], enUso: string[]): string[];           // solo los "reelvid-" que ningún clip usa
// (parte de navegador, sin prueba de unidad)
export async function guardarVideo(archivo: Blob): Promise<{ archivoId: string; duracion: number; portada: string }>;
export async function abrirVideo(archivoId: string): Promise<Blob | null>;           // de «archivos» o de la galería
export async function limpiarHuerfanos(enUso: string[]): Promise<void>;
// lib/media-store.ts
export async function listFileIds(): Promise<string[]>;
export async function getItem(id: string): Promise<StoredItem | null>;
```

- [ ] **Step 1: Pruebas que fallan:** `revisarArchivo` → más de 100 MB: «Ese video pesa más de 100 MB.»; tipo que no empieza con `video/`: «Elige un archivo de video.»; 0 bytes: «Este video no se puede abrir en tu navegador.»; válido → `null`. `idDeArchivo`. `huerfanos(["reelvid-a","reelvid-b","reel-foto1"], ["reelvid-a","gal:9"])` → `["reelvid-b"]` (nunca toca las fotos ni la galería).
- [ ] **Step 2:** Run → FAIL. **Step 3:** implementar. `guardarVideo` usa `probeFile` de `lib/video-engine.ts` para duración (finita y mayor que 0; si no, error «Este video no se puede abrir en tu navegador.») y portada (cuadro a 720 px de lado mayor, JPG). **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `git commit -m "Editor de video: guardar y abrir videos propios en el dispositivo"`

---

### Task 4: La cámara de Studio graba video (`app/camara.tsx`, `lib/camara.ts`)

**Files:**
- Modify: `app/camara.tsx`, `lib/camara.ts`, `lib/camara.test.ts`, `lib/locales/en.ts`

**Interfaces:**
- Produces:

```tsx
// lib/camara.ts
export const MAX_GRABACION = 60;
export function relojGrabacion(segundos: number): string;      // 7 → "0:07 / 1:00"
export function formatoGrabacion(soporta: (mime: string) => boolean): string | null; // MP4 H.264 primero, luego WebM
// app/camara.tsx
export default function Camara(props: { modo?: "foto" | "video"; onFoto?(dataUrl: string): void | Promise<void>; onVideo?(video: Blob): void | Promise<void>; onCerrar(): void; lleno?: boolean });
```

- [ ] **Step 1: Pruebas que fallan** (`lib/camara.test.ts`): `relojGrabacion(7)` → `"0:07 / 1:00"`, `(60)` → `"1:00 / 1:00"`; `formatoGrabacion` elige MP4 si se soporta, si no WebM, si nada → `null`; `mensajeCamara` para micrófono negado → «No hay permiso de micrófono: el video se grabará sin sonido.»
- [ ] **Step 2:** Run → FAIL. **Step 3:** implementar. **Step 4:** Run → PASS.
- [ ] **Step 5: Componente.** En `modo="video"`: pide cámara y micrófono; si el micrófono se niega, reintenta solo con cámara y muestra el aviso. Botón de grabar (rojo) con `relojGrabacion`; se detiene solo a los 60 s; al detener muestra el video grabado con **Usar este video** y **Repetir**. `onVideo(blob)` y cierra. El modo foto no cambia.
- [ ] **Step 6: Commit** `git commit -m "Editor de video: la cámara de Studio graba video con sonido"`

---

### Task 5: Panel del clip de video (`app/linea-tiempo.tsx`)

**Files:**
- Modify: `app/linea-tiempo.tsx`, `app/globals.css`, `lib/locales/en.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: props nuevas de `LineaTiempo`: `videoDe(archivoId: string): string | null` (enlace local del archivo, `null` si falta), `onRecortar(i, inicio, fin)`, `onDividir(i, segundo)`, `onCongelar(i, segundo)`, `panelVideo(i): ReactNode` (botones de origen: grabar, subir, galería, sustituir; los pone reel-studio).

- [ ] **Step 1: Implementar.** En la fila, el clip de video lleva la etiqueta «Video» y su duración en pantalla. En el panel de un video: reproductor pequeño del tramo (`<video>` con el enlace local), dos deslizadores **Inicio** y **Fin** (pasos de 0.1 s), **Dividir aquí** en la posición del reproductor, **Velocidad** (×0.5, ×1, ×1.5, ×2, con el aviso «A otra velocidad el sonido se oye distinto»), interruptor **Sonido de este video**, **Congelar este cuadro** (lo agrega como foto después del video) y `panelVideo(i)`. Si `videoDe` da `null`: «Falta el archivo de este video» y solo `panelVideo(i)`. El panel de foto gana, vía `panelImagen`, los botones para convertirlo en video (los pone reel-studio).
- [ ] **Step 2:** Estilos y traducciones. Run: `npx tsc --noEmit`.
- [ ] **Step 3: Commit** `git commit -m "Editor de video: panel del clip de video"`

---

### Task 6: Integración en el Creador de Reels (`app/reel-studio.tsx`)

**Files:**
- Modify: `app/reel-studio.tsx`, `lib/locales/en.ts`, `README.md`

- [ ] **Step 1: Archivos.** Mapa en memoria `archivoId → enlace local` (`URL.createObjectURL`), que se llena al abrir (con `abrirVideo`) y al agregar; los enlaces se sueltan al salir. Al abrir la app, `limpiarHuerfanos(ids en uso)`. «Empezar nuevo» limpia también.
- [ ] **Step 2: Agregar video a un clip.** Tres orígenes en el panel: **Grabar video** (abre `Camara modo="video"`; el resultado se guarda en la galería con `onVideo` y entra al clip), **Subir video** (`<input type="file" accept="video/*">` → `revisarArchivo` → `guardarVideo`) y **Video de mi galería** (los `kind: "video"`). Sobre un clip vacío o de foto usa `sustituir`; el botón **Sustituir** de un video hace lo mismo.
- [ ] **Step 3: Operaciones.** `onRecortar`, `onDividir`, velocidad y sonido pasan por `editar` (se pueden deshacer; el recorte arrastrado cuenta como un solo paso). `onCongelar`: dibuja el cuadro en un lienzo, lo guarda en la galería y lo inserta como clip de foto después del video.
- [ ] **Step 4: Exportar y vista previa.** `aEscenas(lista, { tomas, videos })` con los enlaces locales; `volumenes` desde dos deslizadores nuevos en el paso de audio: **Volumen de la voz** y **Volumen del sonido de los videos** (este solo si hay videos con sonido).
- [ ] **Step 5: Director.** El resumen incluye los clips de video; sin acciones nuevas.
- [ ] **Step 6:** README, traducciones. Run: `npx tsc --noEmit && npm test && npm run build`.
- [ ] **Step 7: Commit** `git commit -m "Editor de video: videos propios, cámara y sonido en el Creador de Reels"`

---

### Task 7: Comprobación en navegador

- [ ] **Step 1:** Con Playwright y cámara y micrófono simulados (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`):
  - Subir un video corto de prueba (generado con `ffmpeg`, 6 s con tono), recortarlo a 1–4 s y exportar con una foto: la duración coincide (±0.5 s) y el archivo final **trae pista de audio**; con el sonido del clip apagado y sin música ni voz, **no** la trae o va en silencio.
  - Dividir el video a la mitad: dos clips; Deshacer los junta.
  - Velocidad ×2: el contador baja a la mitad de ese clip.
  - Grabar 3 s con la cámara simulada → «Usar este video» → aparece como clip con su duración.
  - Congelar un cuadro: aparece un clip de foto nuevo después del video.
  - Recargar: el video sigue en su clip. Borrar el archivo a mano (IndexedDB) y recargar: «Falta el archivo» y «Sustituir».
  - Un archivo de 101 MB simulado: «Ese video pesa más de 100 MB.»
  - Vista previa con sonido: se detiene y el sonido se corta.
  - 390 px: el panel de video no se sale; botones de 44 px o más.
- [ ] **Step 2:** Anotar lo comprobado y lo que queda para Hector (cámara y micrófono reales en celular, sobre todo iPhone).
