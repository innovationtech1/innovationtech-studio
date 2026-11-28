# Creador guiado de video con NOVA — Etapa 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un camino de 4 pasos guiado por NOVA en Videos que recibe fotos, tema y una línea por foto, y entrega el video armado en el editor actual.

**Architecture:** La lógica del recorrido vive en `lib/video-guiado.ts` (pura, probada). La pantalla `app/video-guiado.tsx` solo pinta ese estado. Al «Armar» no se duplica nada: el recorrido se convierte en una `SecuenciaEntrante` y entra por el mismo camino que «Secuencia de fotos» (`cargarSecuencia` en `app/reel-studio.tsx`), donde la tarjeta «Video de NOVA» ya escribe el guion y graba la voz.

**Tech Stack:** Next.js 15, React, TypeScript, node:test + tsx, Playwright para la revisión visual.

**Spec:** `docs/superpowers/specs/2026-11-27-creador-guiado-nova-design.md`

## Global Constraints

- De 2 a 8 fotos (`MIN_FOTOS_VIDEO` = 2, `MAX_FOTOS` = 8).
- Formato por defecto `9:16`. Duración: la que da `duracionParaFotos(n)`; se cambia en la tarjeta de NOVA.
- Sin precios ni compras dentro del recorrido.
- Todo texto nuevo en español en el código y con su traducción en `lib/locales/en.ts`.
- Un fallo nunca borra fotos, tema ni líneas. «Empezar de nuevo» pregunta antes de borrar.
- El editor avanzado (`app/reel-studio.tsx`) no cambia de comportamiento salvo aceptar `animar`.
- Etapa 1 no envía fotos a ningún servicio: la persona escribe la línea de cada foto.

## Review Focus

- Foto que no se puede leer (archivo dañado o no es imagen): se ignora con aviso, el resto se agrega.
- Más de 8 fotos elegidas de una vez: entran las primeras hasta 8 y NOVA dice que el máximo es 8.
- Línea vacía en una foto: no bloquea; viaja como «Foto N».
- «Animar con IA» en más fotos que tomas disponibles: no deja marcar de más y NOVA dice cuántas quedan.
- Armar con un video ya abierto en el editor: pregunta (lo decide `decidirEntrada`, ya existente), no pisa en silencio.

---

### Task 1: Lógica del recorrido

**Files:**
- Create: `lib/video-guiado.ts`
- Test: `lib/video-guiado.test.ts`

**Interfaces:**
- Consumes: `MAX_FOTOS` de `lib/secuencia.ts`; `MIN_FOTOS_VIDEO` de `lib/secuencia-pantalla.ts`; `ReelFormat` de `lib/reel.ts`.
- Produces:
  - `type PasoGuiado = 1 | 2 | 3 | 4`
  - `type FotoGuiada = { id: string; src: string }`
  - `type EstadoGuiado = { paso: PasoGuiado; fotos: FotoGuiada[]; tema: string; formato: ReelFormat; lineas: Record<string, string>; animar: string[] }`
  - `const GUIADO_VACIO: EstadoGuiado`, `const MAX_TEMA_GUIADO = 200`, `const MAX_LINEA_GUIADA = 80`
  - `agregarFotos(e, nuevas: FotoGuiada[]): { estado: EstadoGuiado; sobraron: number }`
  - `quitarFoto(e, id): EstadoGuiado` · `moverFoto(e, id, dir: -1 | 1): EstadoGuiado`
  - `faltaPara(e): string | null` · `avanzar(e): EstadoGuiado` · `regresar(e): EstadoGuiado`
  - `alternarAnimar(e, id, tomasQuedan?: number): EstadoGuiado`
  - `mensajeNova(e, o?: { tomasQuedan?: number; sobraron?: number }): string`
  - `aSecuencia(e): { tema: string; momentos: string[]; fotos: string[]; formato: ReelFormat; animar: boolean[] }`

- [ ] **Step 1: Write the failing tests** — one test per rule:
  - `agregarFotos` corta en 8 y devuelve `sobraron`; no repite un `id`.
  - `quitarFoto` quita también su línea y su marca de animar.
  - `moverFoto` intercambia con la vecina y no hace nada en los extremos.
  - `faltaPara`: paso 1 con 1 foto → `"Sube al menos 2 fotos."`; paso 2 con tema vacío → `"Escribe de qué trata el video."`; paso 3 → `null` aunque haya líneas vacías.
  - `avanzar` no pasa de paso si `faltaPara` no es `null`; `regresar` no baja de 1; ninguno borra datos.
  - `alternarAnimar` marca y desmarca; con `tomasQuedan = 1` no deja marcar una segunda; `undefined` = sin tope.
  - `mensajeNova` por paso: 1 `"Sube las fotos de tu video, en el orden en que quieres que salgan."`; 2 `"Cuéntame en una frase de qué es el video."`; 3 `"Escribe en pocas palabras qué se ve en cada foto. Con eso escribo el guion."`; 4 `"Estoy armando tu video."`; con `sobraron > 0` en paso 1 añade `"El máximo son 8 fotos."`; con `tomasQuedan = 0` en paso 3 añade `"Hoy no te quedan animaciones con IA."`.
  - `aSecuencia`: línea vacía → `"Foto N"`; líneas recortadas a 80; `animar` alineado con `fotos`.
- [ ] **Step 2: Run** `node --conditions=react-server --import tsx --test lib/video-guiado.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/video-guiado.ts`** with the signatures above. Pure functions, no React, no `window`.
- [ ] **Step 4: Run the same command** — Expected: all pass.
- [ ] **Step 5: Commit.**

### Task 2: La secuencia acepta «animar»

**Files:**
- Modify: `lib/secuencia-video.ts` (`SecuenciaEntrante`, `clipsDeSecuencia`, `limpiarEntrante`)
- Modify: `app/secuencia-fotos.tsx` (`SecuenciaParaVideo` gana `animar?: boolean[]`)
- Modify: `app/reel-studio.tsx` (`cargarSecuencia` pasa `s.animar`)
- Test: `lib/secuencia-video.test.ts`

**Interfaces:**
- Produces: `SecuenciaEntrante.animar?: boolean[]`; `clipsDeSecuencia(fotos, momentos, total, animar?: boolean[]): Clip[]` — la foto con `animar[i] === true` sale con `tipo: "toma"`; las demás, `"foto"`.

- [ ] **Step 1: Write the failing tests** — `clipsDeSecuencia` con `animar = [false, true]` da tipos `["foto", "toma"]`; sin `animar` todas `"foto"` (lo de hoy no cambia); `limpiarEntrante` conserva `animar` recortado al número de fotos y lo descarta si no es una lista de sí/no.
- [ ] **Step 2: Run** `node --conditions=react-server --import tsx --test lib/secuencia-video.test.ts` — Expected: los nuevos FAIL.
- [ ] **Step 3: Implement** en los tres archivos.
- [ ] **Step 4: Run** `npm test` — Expected: todo pasa.
- [ ] **Step 5: Commit.**

### Task 3: La pantalla y la entrada en Videos

**Files:**
- Create: `app/video-guiado.tsx`
- Modify: `app/page.tsx` (modo `"guiado"` en la pestaña Videos; por defecto para quien no ha elegido)
- Modify: `app/globals.css` (estilos `.guiado-*`)
- Modify: `lib/locales/en.ts`

**Interfaces:**
- Consumes: todo lo de Task 1; `NovaAvatar`; `LibraryPicker` para elegir de Galería; `quedanDe(cuenta, "tomas")` para `tomasQuedan`.
- Produces: `export default function VideoGuiado(props: { gallery: Item[]; onArmar: (s: SecuenciaParaVideo) => void; onEditor: () => void })`.

- [ ] **Step 1:** Selector de modo en `app/page.tsx`: «Crear video con NOVA» · «Editor avanzado» · «Secuencia de fotos». `onArmar` hace lo mismo que `onHacerVideo` de la secuencia (sube `n` y abre el editor).
- [ ] **Step 2:** `app/video-guiado.tsx`: cabecera con `NovaAvatar` y `mensajeNova`; indicador «Paso N de 4»; cuerpo por paso; pie con «Atrás», «Siguiente»/«Armar mi video» y «Empezar de nuevo» (con confirmación). El aviso de `faltaPara` sale junto al botón en lugar de deshabilitarlo en silencio.
  - Paso 1: subir archivos (se reducen a 1280 px de lado mayor antes de guardarse en memoria), elegir de Galería, miniaturas con quitar y mover.
  - Paso 2: campo del tema con dictado (`MicButton`) y los tres formatos.
  - Paso 3: cada foto con su línea (máx. 80) y la casilla «Animar con IA».
  - Paso 4: llama `onArmar(aSecuencia(estado))` y deja el recorrido en el paso 1 vacío.
- [ ] **Step 3:** Tema, formato y líneas se guardan con `usePersistentState("guiado:texto", …)`; las fotos solo en memoria (continuar tras cerrar es Etapa 3).
- [ ] **Step 4:** Traducciones en `lib/locales/en.ts`.
- [ ] **Step 5: Run** `npx tsc --noEmit && npm test && npm run build` — Expected: sin errores.
- [ ] **Step 6:** Revisión visual con Playwright en 360×640: recorrer los 4 pasos con 3 fotos de prueba, capturar cada paso, y comprobar que tras «Armar mi video» el editor muestra 3 clips y la tarjeta «Video de NOVA».
- [ ] **Step 7: Commit.**

### Task 4: Entrega

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build` en limpio.
- [ ] **Step 2:** Subir a `video-hibrido`, unir en `pruebas`, abrir la solicitud a `main`.
- [ ] **Step 3:** Decirle a Hector qué probar en el sitio de pruebas y qué no se pudo verificar.
