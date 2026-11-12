# Editor de video · Entrega 1 (línea de tiempo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el paso «2. Escenas» del Creador de Reels en una fila de clips que se pueden mover, duplicar, borrar y medir en segundos, con deshacer, texto con posición y tamaño, vista previa sin grabar y videos de hasta 2 minutos.

**Architecture:** La lógica vive en un módulo puro (`lib/linea-tiempo.ts`) con pruebas; el motor (`lib/reel.ts`) deja de repartir el tiempo y recibe una lista explícita de escenas; la fila de clips es un componente nuevo (`app/linea-tiempo.tsx`) que `app/reel-studio.tsx` usa en lugar de la lista de escenas. Las tomas con IA siguen el flujo de hoy (se marcan por clip y se generan juntas).

**Tech Stack:** Next.js 15 (App Router), React, TypeScript, lienzo 2D + MediaRecorder, `node:test` con `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-11-editor-video-design.md` (secciones «Cómo se ve», «Modelo de datos», «El motor», «Guardado», «Errores» y la entrega 1 de «Entregas»).

## Global Constraints

- Duración máxima del video: **120 s** contando el cierre de 3 s con la marca.
- Duración de una foto: de **1.5 a 15 s**; por defecto 3 s.
- Una toma con IA dura **5 s**. En esta entrega, máximo **4** tomas por video (el tope de 8 es de la entrega 3).
- Deshacer / rehacer: hasta **50** pasos, solo en memoria.
- Texto de cada clip: posición `arriba | centro | abajo` (por defecto `abajo`) y tamaño `chico | normal | grande` (por defecto `normal`).
- Ningún costo nuevo por video; no se agregan dependencias.
- Todo texto visible va en español en el código y con su traducción en `lib/locales/en.ts`.
- Pruebas con `npm test` (node:test); TDD: cada prueba se ve fallar antes de implementar.
- No se toca nada de cuentas, cobros ni del servidor de video con IA.
- **Nombres:** el `Clip` conserva los nombres de campo de la `Scene` actual (`image`, `imageId`, `caption`, `prompt`, `loading`) en lugar de `imagen` de la spec, para no migrar el guardado de fotos que ya funciona. Es la única diferencia de nombres con la spec.

## Review Focus

1. **Borrador viejo:** quien ya tenía escenas guardadas (sin `id`, sin `segundos`, con `ia: true`) abre la app y conserva sus fotos, textos y marcas de IA. → prueba en Task 1 (`normalizarClips`).
2. **Clips vacíos:** un clip sin foto no cuenta en la duración ni se exporta, y no rompe la vista previa. → prueba en Task 1 (`aEscenas`, `duracionTotal`).
3. **Más de 2 minutos:** exportar y vista previa se bloquean con «Tu video dura M:SS. El máximo es 2:00: quita o acorta algún clip.» → prueba en Task 1 (`validar`).
4. **Toma que no se generó** (fallo, sin cuota o IA en pausa): se exporta como foto con zoom durante 5 s, sin romper el video. → prueba en Task 1 (`aEscenas` con toma sin clip).
5. **Voz más larga que el video:** hoy la voz alarga el video sola; con duración por clip ya no. El cliente debe ver el aviso y poder repartir las fotos para cubrir la voz con un toque. → prueba en Task 1 (`ajustarAVoz`) y comprobación en Task 5.

---

### Task 1: Modelo de clips y operaciones (`lib/linea-tiempo.ts`)

**Files:**
- Create: `lib/linea-tiempo.ts`
- Test: `lib/linea-tiempo.test.ts`

**Interfaces:**
- Produces:

```ts
export const MAX_VIDEO = 120, CIERRE = 3, MIN_FOTO = 1.5, MAX_FOTO = 15, FOTO_DEFECTO = 3, SEGUNDOS_TOMA = 5, MAX_TOMAS = 4;
export type TextoPos = "arriba" | "centro" | "abajo";
export type TextoTam = "chico" | "normal" | "grande";
export type Clip = {
  id: string;
  tipo: "foto" | "toma";          // "video" llega en la entrega 2
  image: string; imageId?: string; loading?: boolean;
  caption: string; prompt: string;
  segundos: number;                // foto: 1.5–15; toma: se ignora (5)
  movimiento?: string;             // toma
  textoPos?: TextoPos; textoTam?: TextoTam;
};
export type EscenaRender = { imagen: string; texto: string; textoPos: TextoPos; textoTam: TextoTam; segundos: number; video?: string | null };
export function nuevoClip(extra?: Partial<Clip>): Clip;                       // id nuevo, tipo foto, 3 s, vacío
export function normalizarClips(guardado: unknown, segundosViejos?: number): Clip[]; // acepta Scene[] viejas o Clip[]
export function duracionClip(c: Clip): number;                                // 0 si no tiene image
export function duracionTotal(clips: Clip[]): number;                         // suma + cierre si cabe (ver cierreDe)
export function cierreDe(clips: Clip[]): number;                              // 3 si suma+3 ≤ 120 y hay clips con foto; si no, 0
export function validar(clips: Clip[]): string | null;                        // null = se puede exportar
export function mover(clips: Clip[], de: number, a: number): Clip[];
export function duplicar(clips: Clip[], i: number): Clip[];                   // copia con id nuevo, justo después
export function borrar(clips: Clip[], i: number): Clip[];                     // nunca deja la lista vacía: deja un clip nuevo
export function cambiar(clips: Clip[], i: number, cambios: Partial<Clip>): Clip[]; // acota segundos a 1.5–15
export function aEscenas(clips: Clip[], clipsIa?: Record<string, string | null>): EscenaRender[]; // por id de clip → URL del clip de IA
export function ajustarAVoz(clips: Clip[], segundosVoz: number): Clip[];      // reparte las fotos para cubrir la voz
export function formatoTiempo(segundos: number): string;                      // 134 → "2:14"
```

- [ ] **Step 1: Escribir las pruebas que fallan** en `lib/linea-tiempo.test.ts`. Una prueba por comportamiento, con estos valores:
  - `nuevoClip()` → tipo `foto`, `segundos` 3, `image` y `caption` vacíos, `id` distinto en cada llamada.
  - `normalizarClips([{ image: "x", caption: "a", prompt: "p", imageId: "reel-1", ia: true, movimiento: "zoom" }, { image: "", caption: "", prompt: "" }], 4)` → primer clip `tipo: "toma"`, conserva `image`, `imageId`, `caption`, `prompt`, `movimiento`; segundo `tipo: "foto"`, `segundos: 4`; ambos con `id`. Con `null`, `"basura"` o `[]` → 4 clips vacíos (como hoy). Un `Clip[]` válido pasa igual (mismos ids). `segundos: 99` guardado se acota a 15.
  - `duracionClip`: foto con imagen de 4 s → 4; toma con imagen → 5; clip sin `image` → 0.
  - `duracionTotal` y `cierreDe`: fotos de 3+3+3 → 12 (9 + cierre 3); 40 fotos de 3 s (120) → cierre 0, total 120; lista sin fotos → 0.
  - `validar`: sin ninguna foto → `"Agrega al menos una imagen a las escenas."`; 45 fotos de 3 s (135 s) → `"Tu video dura 2:15. El máximo es 2:00: quita o acorta algún clip."`; 5 tomas → `"Puedes marcar máximo 4 fotos con IA por video."`; caso normal → `null`.
  - `mover([a,b,c], 0, 2)` → `[b,c,a]`; índices fuera de rango o iguales → la misma lista. `duplicar([a,b], 0)` → `[a, a', b]` con `a'.id !== a.id` y mismos datos. `borrar([a], 0)` → un clip vacío nuevo; `borrar([a,b], 5)` → igual. Ninguna muta la lista original.
  - `cambiar(clips, 0, { segundos: 0.2 })` → 1.5; `{ segundos: 40 }` → 15; `{ textoPos: "arriba" }` se aplica.
  - `aEscenas`: omite los clips sin `image`; foto → `{ imagen, texto: caption, textoPos: "abajo", textoTam: "normal", segundos }`; toma con `clipsIa[id] = "https://clip"` → `segundos: 5, video: "https://clip"`; toma sin clip (o `null`) → `segundos: 5` y sin `video` (se verá como foto con zoom).
  - `ajustarAVoz`: 4 fotos de 3 s y voz de 20 s → cada foto 5.125 s (20 + 0.5 entre 4); con una toma y 2 fotos, voz de 20 s → fotos de 7.75 s y la toma intacta; voz más corta que el video → sin cambios; nunca pasa de 15 s por foto.
  - `formatoTiempo(134)` → `"2:14"`; `formatoTiempo(9)` → `"0:09"`; `formatoTiempo(120)` → `"2:00"`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --conditions=react-server --import tsx --test lib/linea-tiempo.test.ts`
Expected: FAIL, «Cannot find module './linea-tiempo'».

- [ ] **Step 3: Implementar `lib/linea-tiempo.ts`** con las firmas de arriba. Módulo puro: sin React, sin DOM. Ids con `crypto.randomUUID()` si existe y si no `Date.now()` + aleatorio. `validar` revisa en este orden: sin fotos, más de 4 tomas, más de 120 s. Las tomas se cuentan solo entre clips con `image`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `node --conditions=react-server --import tsx --test lib/linea-tiempo.test.ts`
Expected: PASS, todas.

- [ ] **Step 5: Commit**

```bash
git add lib/linea-tiempo.ts lib/linea-tiempo.test.ts
git commit -m "Editor de video: modelo de clips y operaciones de la línea de tiempo"
```

---

### Task 2: Historial de deshacer (`lib/historial.ts`)

**Files:**
- Create: `lib/historial.ts`
- Test: `lib/historial.test.ts`

**Interfaces:**
- Produces:

```ts
export type Historial<T> = { pasado: T[]; presente: T; futuro: T[] };
export const MAX_PASOS = 50;
export function crear<T>(presente: T): Historial<T>;
export function anotar<T>(h: Historial<T>, nuevo: T): Historial<T>;   // descarta el futuro; recorta a 50
export function deshacer<T>(h: Historial<T>): Historial<T>;           // sin pasado → el mismo objeto
export function rehacer<T>(h: Historial<T>): Historial<T>;            // sin futuro → el mismo objeto
```

- [ ] **Step 1: Pruebas que fallan** en `lib/historial.test.ts`: anotar 3 estados y deshacer 2 veces deja el presente en el primero y 2 en futuro; rehacer vuelve; anotar después de deshacer vacía el futuro; anotar 60 estados deja 50 en pasado (se pierden los más viejos); `anotar(h, h.presente)` con el **mismo** objeto no agrega paso; deshacer sin pasado y rehacer sin futuro devuelven el mismo objeto (`assert.equal`).
- [ ] **Step 2:** Run: `node --conditions=react-server --import tsx --test lib/historial.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** las cuatro funciones (inmutables).
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5: Commit** `git commit -m "Editor de video: historial de deshacer y rehacer"`

---

### Task 3: Motor con escenas explícitas, texto con posición y vista previa (`lib/reel.ts`)

**Files:**
- Modify: `lib/reel.ts`
- Delete: `lib/reel-escenas.ts`, `lib/reel-escenas.test.ts` (el reparto automático ya no se usa)
- Create: `lib/reel-texto.ts`, `lib/reel-texto.test.ts`

**Interfaces:**
- Consumes: `EscenaRender`, `TextoPos`, `TextoTam` de Task 1.
- Produces:

```ts
// lib/reel-texto.ts (puro)
export function medidasTexto(pos: TextoPos, tam: TextoTam, vertical: boolean): { centroY: number; tamano: number };
//   centroY (fracción del alto): arriba 0.2 · centro 0.5 · abajo 0.7 (vertical) o 0.66 (cuadrado / horizontal)
//   tamano (fracción del lado corto): chico 0.046 · normal 0.058 · grande 0.072

// lib/reel.ts
export type ReelOptions = {
  escenas: EscenaRender[];   // reemplaza a images, captions, secondsPerSlide, duracion, tomas y clips
  cierre: number;            // 3 o 0 (lo decide cierreDe de Task 1)
  format; accent; brandName; cta; logo?; music?; voice?; script?; onProgress?; onStatus?; previewCanvas?  // sin cambios
};
export function renderReel(o: ReelOptions): Promise<ReelResult>;                      // graba
export function vistaPrevia(o: ReelOptions, signal: AbortSignal): Promise<void>;      // dibuja en previewCanvas sin grabar; termina al acabar o al abortar
```

- [ ] **Step 1: Prueba que falla** `lib/reel-texto.test.ts`: `medidasTexto("abajo","normal",true)` → `{ centroY: 0.7, tamano: 0.058 }`; `("abajo","normal",false)` → `0.66`; `("arriba","grande",true)` → `{ 0.2, 0.072 }`; `("centro","chico",false)` → `{ 0.5, 0.046 }`.
- [ ] **Step 2:** Run: `node --conditions=react-server --import tsx --test lib/reel-texto.test.ts` → FAIL.
- [ ] **Step 3: Implementar `lib/reel-texto.ts`.**
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5: Cambiar `lib/reel.ts`:**
  - `drawCaption` recibe `pos` y `tam` y usa `medidasTexto` (hoy tiene fijos 0.058 y 0.7 / 0.66).
  - `renderReel` toma tiempos de `o.escenas[i].segundos` (`starts` acumulados) y `o.cierre`; ya no calcula `per`, ni alarga por la voz, ni llama a `planDeEscenas`. Las imágenes salen de `escenas[i].imagen`; el clip de IA, de `escenas[i].video` (si no carga, queda la foto con zoom, como hoy).
  - Extraer el ciclo de dibujo a una función interna que usen `renderReel` y `vistaPrevia`. `vistaPrevia` no crea `MediaRecorder` ni mezcla de audio grabada: reproduce voz y música por las bocinas con elementos `<audio>` y los detiene al abortar.
  - Quitar de `ReelOptions`: `images`, `captions`, `secondsPerSlide`, `duracion`, `tomas`, `clips`.
- [ ] **Step 6: Borrar** `lib/reel-escenas.ts` y su prueba. Run: `npx tsc --noEmit` → los únicos errores esperados están en `app/reel-studio.tsx` (se arreglan en Task 5).
- [ ] **Step 7: Commit** `git commit -m "Editor de video: el motor recibe escenas con su duración, texto con posición y vista previa"`

---

### Task 4: Componente de la fila de clips (`app/linea-tiempo.tsx`)

**Files:**
- Create: `app/linea-tiempo.tsx`
- Modify: `app/globals.css` (estilos `.lt-*`), `lib/locales/en.ts`

**Interfaces:**
- Consumes: `Clip`, `duracionClip`, `formatoTiempo`, `MIN_FOTO`, `MAX_FOTO`, `MAX_TOMAS` de Task 1.
- Produces:

```tsx
export default function LineaTiempo(props: {
  clips: Clip[];
  elegido: number;                               // índice del clip abierto (−1 = ninguno)
  onElegir(i: number): void;
  onMover(de: number, a: number): void;
  onDuplicar(i: number): void;
  onBorrar(i: number): void;
  onCambiar(i: number, cambios: Partial<Clip>): void;
  onAgregar(): void;
  conIa: boolean;                                // muestra «Animar con IA» (hay cuenta con sesión)
  tomasMarcadas: number;
  ocupado: boolean;
  panelImagen(i: number): React.ReactNode;       // botones de imagen del clip (subir, galería, crear con IA, editar, quitar): los pone reel-studio
}): JSX.Element;
```

- [ ] **Step 1: Implementar el componente.**
  - Fila con desplazamiento horizontal; cada clip es un botón con miniatura (o «＋» si está vacío), etiqueta de tipo («Foto» / «IA») y duración (`formatoTiempo`). El elegido lleva borde de acento.
  - Arrastrar para reordenar con `draggable` y eventos `dragstart` / `dragover` / `drop` (solo ratón). Los botones ← → del panel hacen lo mismo en cualquier dispositivo.
  - Panel del clip elegido, debajo de la fila: `props.panelImagen(i)`; campo «Texto en pantalla»; selectores «Posición del texto» (Arriba, Centro, Abajo) y «Tamaño del texto» (Chico, Normal, Grande); para foto: «Duración» con deslizador de 1.5 a 15 en pasos de 0.5 y el valor a la vista; si `conIa` y el clip tiene imagen: casilla «Animar con IA (movimiento real, 5 s)» que cambia `tipo` entre `foto` y `toma` (se apaga al llegar a `MAX_TOMAS`) y, si es toma, el campo «Movimiento (opcional)»; botones «← Mover», «Mover →», «Duplicar», «Borrar».
  - Último elemento de la fila: «＋ Agregar» → `onAgregar()`.
  - Accesible: la fila es `role="list"`, cada clip `role="listitem"` con `aria-label` «Clip 2 de 5, foto, 3 segundos».
- [ ] **Step 2: Estilos** `.lt-fila`, `.lt-clip`, `.lt-clip.elegido`, `.lt-panel` en `app/globals.css`, con las variables de color existentes; objetivo táctil mínimo de 44 px.
- [ ] **Step 3: Traducciones** de cada texto nuevo en `lib/locales/en.ts`.
- [ ] **Step 4:** Run: `npx tsc --noEmit` → sin errores nuevos en `app/linea-tiempo.tsx`.
- [ ] **Step 5: Commit** `git commit -m "Editor de video: fila de clips y panel del clip"`

---

### Task 5: Integrar en el Creador de Reels (`app/reel-studio.tsx`)

**Files:**
- Modify: `app/reel-studio.tsx`, `lib/locales/en.ts`, `README.md` (sección de Videos)

**Interfaces:**
- Consumes: todo lo de Tasks 1–4; `renderReel` / `vistaPrevia` de Task 3.

- [ ] **Step 1: Estado.** Reemplazar `scenes` por `clips` usando la misma llave de guardado `reel:escenas-datos` y `normalizarClips(guardado, seconds)` como lectura (el valor viejo de `reel:segundos` se usa una sola vez para dar `segundos` a los clips viejos). El guardado de fotos por `imageId` no cambia. Envolver los cambios de clips en `historial` (Task 2): `anotar` en cada operación del usuario (mover, duplicar, borrar, cambiar, agregar, poner o quitar imagen); **no** anotar los cambios internos (`loading`, asignación de `imageId`, restauración al abrir).
- [ ] **Step 2: Pantalla.** Quitar los selectores «Escenas», «Duración del video» y «Segundos por escena». En su lugar: `<LineaTiempo …/>` con, arriba, «M:SS de 2:00» (`formatoTiempo(duracionTotal(clips))`), botones **Deshacer** y **Rehacer** (apagados sin pasos) y **Vista previa** / **Detener**. `panelImagen(i)` devuelve los botones de imagen que hoy tiene cada escena. «＋ Agregar» añade `nuevoClip()` al final y lo elige. «Sugerir ideas» llena los clips como hoy llena las escenas (crea los que falten, conserva los que sobren).
- [ ] **Step 3: Exportar.** `grabar` y `buildReel` llaman a `renderReel({ escenas: aEscenas(clips, clipsIa), cierre: cierreDe(clips), … })`. Antes: `const error = validar(clips); if (error) throw new Error(error)`. «Generar con IA» toma las tomas (`tipo === "toma"` con imagen), las pide juntas como hoy y arma `clipsIa` por `id` de clip. Quitar `duracionAjustada`, `duracionPara`, `duracionMinima` y `marcarIa`.
- [ ] **Step 4: Vista previa.** El botón llama a `vistaPrevia` con un `AbortController`; «Detener» aborta; las tomas sin generar se ven con zoom. No gasta nada.
- [ ] **Step 5: Voz más larga que el video.** Al tener voz, medir su duración (elemento `Audio`, evento `loadedmetadata`). Si supera `duracionTotal(clips) − cierreDe(clips)`: aviso «La voz dura M:SS y tu video M:SS: la voz se cortaría.» con el botón «Repartir las fotos para cubrir la voz» → `ajustarAVoz` (anotado en el historial).
- [ ] **Step 6: Traducciones y README.** Textos nuevos en `lib/locales/en.ts`; en el README, una línea en la descripción del Creador de Reels: clips que se mueven, duración por foto, hasta 2 minutos, deshacer y vista previa.
- [ ] **Step 7:** Run: `npx tsc --noEmit && npm test && npm run build` → sin errores; todas las pruebas pasan.
- [ ] **Step 8: Commit** `git commit -m "Editor de video: línea de tiempo en el Creador de Reels"`

---

### Task 6: Comprobación en navegador

**Files:**
- Ninguno del proyecto (el guion de Playwright vive fuera del repositorio).

- [ ] **Step 1:** Con `npx next start` y Chrome por Playwright (cuentas apagadas), en «Videos»:
  - Subir 3 fotos; poner el segundo clip en 5 s; mover el tercero al principio; duplicar uno; borrar otro; **Deshacer** dos veces y **Rehacer** una. Comprobar el orden y que el total mostrado coincide con la suma + 3 s de cierre.
  - **Vista previa**: corre y se puede detener; no aparece video descargable.
  - **Crear reel**: el MP4 resultante dura lo que marca el total (±0.5 s).
  - Texto de un clip en «Arriba» y «Grande»: captura del lienzo a mitad de ese clip y comprobar que el recuadro del texto queda en el tercio superior.
  - Simular un borrador viejo en `localStorage` (`its-draft:reel:escenas-datos` con 2 escenas sin `id`) y comprobar que abren como 2 clips con sus textos.
  - 45 fotos de 3 s: el botón de crear muestra «Tu video dura 2:15. El máximo es 2:00: quita o acorta algún clip.» y no exporta.
- [ ] **Step 2:** Repetir la fila de clips con un ancho de 390 px (celular): los botones ← → funcionan y nada se sale de la pantalla.
- [ ] **Step 3:** Anotar en el mensaje final qué se comprobó y qué no (las tomas con IA reales las prueba Hector en la versión de prueba).
