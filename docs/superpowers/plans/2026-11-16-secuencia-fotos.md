# Secuencia de fotos + «Hacer el video con NOVA» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In the Video tab, a new mode «Crear secuencia de fotos»: the AI creates 3–8 DISTINCT photos that tell a story in order; then «Hacer el video con NOVA» opens the Reel creator with those photos in order, a voice-over script written by NOVA for the chosen duration, generated with NOVA's chosen voice and style, ready to animate («Con IA») and record.

**Owner approval:** Hector, 2026-11-16 («así es»). Flow and costs as described to him: photos count as images, the reel voice counts as one voice-over, animations count as tomas con IA; always confirm before spending.

**Architecture:** Pure prompt builders/parsers in `lib/secuencia.ts`; two new modes in `/api/text` («secuencia», «guion_secuencia») using the existing access check and «textos» counter; images through the existing `/api/image` (one call per photo, «imagenes» counter); UI `app/secuencia-fotos.tsx`; hand-off into `ReelStudio` via a new prop `incomingSecuencia`.

**Tech Stack:** Next.js 15, TypeScript, React, Cloudflare Workers AI (Llama text, Flux images, Aura voices), `node:test`.

## Global Constraints
- No new dependencies; no new Firestore reads/writes; no new env vars.
- Photos must be different story moments: every idea has a distinct `momento` (short Spanish label) and a distinct English `prompt`; all prompts share one style suffix so they look like the same photo session.
- 3 ≤ n ≤ 8 photos; durations 10/15/20/30 s; voice-over length ≈ 2.4 words per second of the chosen duration (± 15 %).
- Confirm before spending, with remaining counts from `useCuenta()` when available: «Esto usa N imágenes de tu límite (te quedan M). ¿Las creo?».
- Every new Spanish UI string has its `lib/locales/en.ts` entry. Mobile first, brand palette.
- Commits in Spanish with the session trailer; never push.

## Review Focus
1. The model returns fewer/more items, duplicates, or non-JSON → parser repairs or fails with a clear Spanish error, never creates duplicate photos. (Task 1 tests.)
2. One photo fails to generate → the others stay; that photo shows «Rehacer»; the user is never charged twice for a photo that succeeded. (Task 2.)
3. «Hacer el video con NOVA» while the current reel project has content → asks before replacing; or opens a new project if projects support it. (Task 3.)
4. Voice generation fails or the plan has no voice-over left → the reel still opens with photos and script, with a clear message. (Task 3.)
5. Accounts off → everything works without remaining counts (confirm text without «te quedan»). (Tasks 2–3.)

---

### Task 1: Server — ideas de la secuencia y guion de NOVA
**Files:** Create `lib/secuencia.ts`, `lib/secuencia.test.ts`. Modify `app/api/text/route.ts` (two modes, same access/counter/refund pattern as `mode === "reel"` at ~line 259).

**Interfaces — Produces:**
- `type IdeaFoto = { momento: string; prompt: string }`
- `promptSecuencia(o: { tema: string; n: number; estilo: string; marca?: string; english: boolean }): string` — asks for JSON `{ "titulo": "...", "fotos": [{ "momento": "...", "prompt": "..." }] }`, exactly n items, each a different moment of one story in chronological order, no repeated subject/angle, English prompts ≤ 60 words, no text in images, no real people's names or brands.
- `ESTILOS_FOTO: { id: "realista" | "estudio" | "calido" | "colorido"; nombre: string; sufijo: string }[]` — nombres «Realista», «De estudio», «Cálido», «Colorido»; English style suffix appended to every prompt.
- `leerSecuencia(texto: string, n: number, estilo: string): { titulo: string; fotos: IdeaFoto[] }` — extracts the JSON (tolerates ```json fences / text around); trims to n; drops duplicates (same momento or prompt word-overlap ≥ 0.8); throws `Error("La IA no pudo armar la secuencia. Intenta de nuevo.")` if fewer than 3 remain; appends the style suffix.
- `palabrasGuion(segundos: number): number` = round(segundos × 2.4).
- `promptGuion(o: { tema: string; momentos: string[]; segundos: number; marca?: string; english: boolean }): string` — NOVA writes a warm, professional voice-over that tells the story following the momentos in order, ≈ palabrasGuion words, plain text only (no emojis, hashtags, stage directions), ends with a short call to action.
- `limpiarGuion(texto: string): string` — strips quotes/markdown/labels like «Voz en off:».
- Route: `mode: "secuencia"` body `{ prompt (tema), n, estilo }` → `{ titulo, fotos }`; `mode: "guion_secuencia"` body `{ prompt (tema), momentos, segundos }` → `{ guion }`. Validate n/segundos/estilo/momentos (≤ 8 items, each ≤ 80 chars) → 400 in Spanish. Both use NOVA's persona line from `lib/nova.ts` where it fits (the guion one).
- [ ] Tests first (`lib/secuencia.test.ts`): prompt contents (n, chronological, distinct, JSON shape), parser (fences, extra items, duplicates removed, < 3 → error, suffix appended), `palabrasGuion`, `limpiarGuion`. RED → implement → GREEN. Route compiles; `npm test` # fail 0, tsc, build. Commit «Secuencia de fotos: ideas en orden y guion de NOVA (servidor)».

### Task 2: Pantalla «Crear secuencia de fotos»
**Files:** Create `app/secuencia-fotos.tsx`. Modify `app/page.tsx` (Video tab: a two-option switch «Video» | «Secuencia de fotos», persisted `video:modo`), `app/globals.css`, `lib/locales/en.ts`.

**Behavior:**
- Form: «¿De qué trata la historia?» (textarea, uses brand context), «Cuántas fotos» (3–8, default 5), «Estilo» (ESTILOS_FOTO), «Formato» (vertical 9:16 default / cuadrado / horizontal, same values the reel uses) → «Crear ideas» (calls mode secuencia; counts 1 texto).
- Ideas list in order: number, momento (editable), English prompt hidden behind «Ver detalle» (editable), remove/reorder (up/down), «Agregar momento» (≤ 8).
- «Crear las fotos»: confirm text with N and remaining images; then generate sequentially via `/api/image` (same headers/body pattern as `makeImage` in reel-studio, prompt + `brandVisual(brand)`), showing each photo as it arrives with «Foto 2 de 5…»; failures leave a card with «Rehacer» (1 image, confirmed). Each success saved to the Galería (`onImages`) with prompt = momento.
- Each photo card: «Rehacer» (confirmed), `CompartirBotones`.
- Persist the current sequence (tema, ideas, fotos URLs) with `usePersistentState("secuencia:actual")` so a reload doesn't lose it; «Nueva secuencia» clears (confirm if photos exist).
- Footer button «Hacer el video con NOVA» (enabled with ≥ 2 photos) → calls `onHacerVideo({ tema, momentos, fotos, formato })` (Task 3 wires it; in this task, page.tsx stores it and switches to «Video»).
- [ ] Unit-test any pure helper you add (e.g., reorder/limit). `npm test` # fail 0, tsc, build. Commit «Secuencia de fotos: pantalla para crear la historia en fotos».

### Task 3: «Hacer el video con NOVA»
**Files:** Modify `app/page.tsx`, `app/reel-proyectos.tsx`, `app/reel-studio.tsx`, `lib/locales/en.ts`; tests for any pure helper.

**Behavior:**
- New ReelStudio/ReelProyectos prop `incomingSecuencia?: { tema: string; momentos: string[]; fotos: string[]; formato: string; n: number } | null` (n = change counter, like `incomingTopic`).
- On a new value: if the open project has content, ask «¿Reemplazo el video abierto o creo uno nuevo?» → «Crear uno nuevo» (preferred, if projects allow; respect MAX_PROYECTOS — when full, offer replace) / «Reemplazar» / «Cancelar».
- Load: topic = tema; clips = one photo clip per foto in order (same clip shape the reel uses for images; duration via the existing fixed-duration logic), formato; duration selector defaults to 15 s (or the closest that fits the photo count with `repartirEscenas`/`maxFotos` from `lib/reel-escenas.ts`).
- NOVA panel inside the reel (small card with the NovaAvatar): «NOVA está escribiendo el guion…» → calls mode guion_secuencia with momentos + seconds → sets the voice-over script; then (confirm: «Generar la voz usa 1 voz en off de tu plan (te quedan N). ¿La genero?») generates the voice with NOVA's saved voice (`nova:voz`, fallback DEFAULT_VOICE) and style (`nova:estilo`) through the existing `generarVoz` path + style application from Task 4 of the NOVA plan. If the plan lacks voice-over or it fails → keep the script, show the error, the user can retry or pick another voice.
- Music: turn music on with the current style (no new logic).
- Final hint card: «Marca «Con IA» en las fotos que quieras animar y presiona «Generar con IA». Después graba el video.» (+ link to Video section anchor if simple).
- [ ] `npm test` # fail 0, tsc, build. Commit «Hacer el video con NOVA: fotos, guion y voz listos en el Creador de Reels».
