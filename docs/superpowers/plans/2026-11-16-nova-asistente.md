# NOVA en el Asistente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Studio's text Asistente into NOVA: persona + Studio manual + the client's real plan data, two model speeds, branded animated UI with idle suggestions, NOVA's own voice and image ideas.

**Architecture:** Pure logic in `lib/nova.ts` (instructions, manual, account context, model choice), `lib/nova-sugerencias.ts` (idle suggestions), `lib/nova-voz.ts` (text chunking + client player). `/api/chat` builds NOVA's system prompt; new `/api/nova/voz` route for Aura-2 speech. UI in `app/nova-avatar.tsx` and `app/assistant-chat.tsx`.

**Tech Stack:** Next.js 15, TypeScript, React, Cloudflare Workers AI (Llama text, Deepgram Aura-2 TTS), `node:test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-16-nova-asistente-design.md`

## Global Constraints
- No new dependencies. No new Firestore reads/writes. Never log keys or user text.
- Creative model stays `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; fast model = the current Cloudflare Llama 3.1 8B "fast" instruct id — verify the exact id in the Cloudflare Workers AI model catalog before using it.
- Anthropic provider path in `/api/chat` keeps working (it gets the same NOVA system prompt; model choice only applies to Cloudflare).
- Accounts off (`CUENTAS_ON` false / no cuenta): NOVA still works, without plan data, and says so if asked about the plan.
- Every new Spanish UI string has its English entry in `lib/locales/en.ts` (EN / EN_PATTERNS).
- Mobile first (~375 px); brand palette (navy background, red accents); respect `prefers-reduced-motion`.
- Commits in Spanish ending with the session trailer; never push.

## Review Focus
1. A client asks a price or limit NOVA was not given (accounts off, or a paquete not offered to their plan) → NOVA must say it doesn't have that data, never a number. → Task 1 test on `instruccionesNova` (rule text present) + `contextoCuenta(null)` says «sin datos de plan».
2. A forged `cuenta` object from the browser with huge strings → server truncates/sanitizes (numbers only, known keys) so the prompt can't be bloated or injected. → Task 1 test `contextoCuenta ignora claves desconocidas y textos largos`.
3. Voice on while the user types/sends again → the previous audio stops; no overlapping voices; leaving the tab stops audio. → Task 3 player tests with fake Audio.
4. Idle suggestion while NOVA is streaming, the input has text, or the tab is hidden → no bubble. → Task 2 test on `debeSugerir`.
5. `/api/nova/voz` abuse: long text, non-string, rapid calls → 400 / 429 without calling Cloudflare. → Task 3 tests.

---

### Task 1: NOVA's brain (instructions, manual, account context, two speeds)

**Files:** Create `lib/nova.ts`, `lib/nova.test.ts`. Modify `app/api/chat/route.ts`, `app/assistant-chat.tsx` (send `nova: { cuenta, atajo? }`).

**Interfaces — Produces:**
- `type CuentaNova = { plan: string; estado: string; limites: Record<string, number>; uso: Record<string, number>; saldo: Record<string, number>; reinicio?: number; precios?: { basico: number; pro: number }; paquetes?: { id: string; monto: number; contenido: Record<string, number> }[]; esDueno?: boolean }`
- `limpiarCuenta(x: unknown): CuentaNova | null` — keeps only known keys; numbers finite and 0–1e6; strings ≤ 40 chars; arrays ≤ 6.
- `contextoCuenta(c: CuentaNova | null, english: boolean): string` — plain lines: plan, state, for each counter «nombre: usó X de Y este mes, le quedan Z (+ saldo S)», reset date (America/Chicago), prices, packages offered. `null` → «Sin datos de plan: si preguntan por su plan o precios, explícale que no lo ves y que lo revise en Mi cuenta.»
- `MANUAL_STUDIO: string` — the Studio how-to (tools, steps, states Subiendo / Vista previa lista / En fila / Generando / Listo / tope del día, Compartir, Guardar en Drive, Director con IA, troubleshooting). Write it from the real app (read `app/page.tsx` tabs, `app/reel-studio.tsx`, `lib/estados-video.ts`, `app/compartir-botones.tsx`); ≤ 6 000 characters; no internal architecture.
- `instruccionesNova(o: { english: boolean; marca?: string; cuenta: CuentaNova | null }): string` — persona + rules (spec Meta 1) + image rule («Cuando propongas imágenes, agrega hasta 3 líneas que empiecen con 'PROMPT DE IMAGEN:' …») + manual + account context + brand.
- `type Velocidad = "rapida" | "creativa"`; `elegirVelocidad(texto: string, atajo?: string): Velocidad` — atajos «studio»/«plan» → rápida; «comercial»/«ideas» → creativa; otherwise keywords (cómo, dónde, qué significa, plan, límite, precio, cuánto, error, no funciona → rápida; default creativa).

- [ ] Step 1: failing tests in `lib/nova.test.ts`: `limpiarCuenta` (drops unknown keys, caps strings/arrays, non-object → null); `contextoCuenta` remaining math and saldo, `null` text; `instruccionesNova` contains «NOVA», the never-invent rule, «PROMPT DE IMAGEN», the manual and the context, English variant; `elegirVelocidad` table of cases.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS.
- [ ] Step 5: `/api/chat`: read `nova` from the body; `const cuenta = limpiarCuenta(nova?.cuenta)`; system = `instruccionesNova({ english, marca: brand, cuenta })`; Cloudflare model = rápida → fast id, creativa → current (only when the client did not pick a model explicitly in Settings); fast replies `max_tokens: 700`. Keep everything else (access, refunds, streaming).
- [ ] Step 6: `assistant-chat.tsx`: send `nova: { cuenta: <from useCuenta(), mapped to CuentaNova or null>, atajo }`.
- [ ] Step 7: `npm test` # fail 0, `npx tsc --noEmit`, `npm run build`. Commit «NOVA: instrucciones, manual de Studio, datos del plan y dos velocidades».

### Task 2: Pantalla de NOVA, sello animado y sugerencias

**Files:** Create `app/nova-avatar.tsx`, `lib/nova-sugerencias.ts`, `lib/nova-sugerencias.test.ts`. Modify `app/assistant-chat.tsx`, `app/globals.css`, `lib/locales/en.ts`.

**Interfaces — Produces:**
- `<NovaAvatar estado={"quieta" | "pensando" | "hablando" | "aviso"} tamano?={number} />` — `/icons/icon-192.png` inside a circle; CSS keyframes: pensando/hablando = soft breathing glow; aviso = 3 gentle pulses; none under `prefers-reduced-motion`.
- `type Sugerencia = { id: string; texto: string; mensaje: string }` (mensaje = what gets sent to NOVA when tapped).
- `SUGERENCIAS: (c: CuentaNova | null, marca: string) => Sugerencia[]` — 8–12 items, some conditional (tomas_ia left > 0 → reel idea; weekend → weekend post; textos left low → «aprovecha…»; no plan data → general ideas).
- `siguienteSugerencia(lista: Sugerencia[], vistas: string[]): Sugerencia | null` — first not in `vistas`; when all seen, restart.
- `debeSugerir(s: { inactivoMs: number; desdeUltimaMs: number; escribiendo: boolean; transmitiendo: boolean; visible: boolean; textoEnCaja: boolean }): boolean` — true only if inactivo ≥ 45 000, desdeUltima ≥ 180 000 and none of the blockers.

- [ ] Step 1: failing tests for `SUGERENCIAS` conditions, `siguienteSugerencia` rotation, `debeSugerir` (each blocker, both thresholds). Run → FAIL; implement; → PASS.
- [ ] Step 2: UI in `assistant-chat.tsx`:
  - header: `NovaAvatar` + «NOVA» + green dot «En línea · tu asistente de Studio» + toggle «NOVA habla» (wired in Task 3; render it here disabled-free but no-op until then is NOT allowed — add it in Task 3 instead).
  - greeting «Hola, {negocio}. ¿Qué creamos hoy?» (no name → «Hola. ¿Qué creamos hoy?»).
  - 4 atajos replacing the empty-state SUGGESTIONS list: «Crear un comercial» (asks business/product/red social as needed), «Ideas para publicar» (week's ideas), «¿Cómo uso Studio?», «Mi plan y mis límites»; each sends a message with its `atajo` id.
  - avatar state: pensando while waiting for the first token, hablando while streaming, quieta otherwise.
  - idle timer: track last activity (key, pointer, scroll, send); every 5 s check `debeSugerir`; show a bubble next to the avatar with the suggestion text + «Hazlo» (sends `mensaje`) + «×»; avatar `aviso`; persist seen ids for the session.
  - image ideas: for an assistant message, all `PROMPT DE IMAGEN:` lines (max 3) → each shows its idea and «Crear esta imagen» calling `onImage(prompt)`; the existing single «Crear la imagen» button is replaced by this list.
- [ ] Step 3: en.ts entries. `npm test` # fail 0, tsc, build. Commit «NOVA: pantalla con sello animado, atajos y sugerencias».

### Task 3: La voz de NOVA

**Files:** Create `app/api/nova/voz/route.ts`, `lib/nova-voz.ts`, `lib/nova-voz.test.ts`. Modify `app/assistant-chat.tsx`, `lib/locales/en.ts`.

**Interfaces — Produces:**
- `trozosDeVoz(texto: string, max = 400): string[]` — strips Markdown and `PROMPT DE IMAGEN` lines, splits by sentence, each ≤ max.
- Route `POST /api/nova/voz {text, lang}` → `audio/mpeg`: `requireAccess(req, { herramienta: "asistente", clavePropia: clavePropiaCF(req), cloudflare: true })` without `contador`; 400 if text not a string, empty, or > 400 chars; in-memory per-user throttle (1 request / 3 s → 429); voice fixed: `@cf/deepgram/aura-2-es` speaker «estrella» or `@cf/deepgram/aura-2-en` speaker «luna» (reuse the request/convert code of `app/api/voice/route.ts`; do not count `voces`).
- `crearVozNova(o: { pedir: (t: string) => Promise<Blob>; reproducir: (b: Blob) => Promise<void>; respaldo: (t: string) => Promise<void> }): { decir(texto: string): void; callar(): void; hablando(): boolean }` — queue of chunks; `decir` replaces anything playing; on `pedir` failure → `respaldo` (browser speechSynthesis) for that chunk.
- [ ] Step 1: failing tests: `trozosDeVoz` (limits, sentence split, strips markdown/prompts); `crearVozNova` with fakes (order, callar stops, decir replaces, fallback); route validation and throttle (call the exported handler logic with injected deps if the route file allows; otherwise test a pure `validarVoz` helper).
- [ ] Step 2: implement; PASS.
- [ ] Step 3: UI: toggle «NOVA habla» (off by default, persisted with `usePersistentState("nova:habla")`); when on, speak the suggestion bubble and each finished assistant reply; the existing «Escuchar» per message uses the same voice; stop audio on new send, new chat, toggle off, unmount, and `document.hidden`; avatar `hablando` while audio plays. First suggestion of a visit is never spoken until the user has interacted.
- [ ] Step 4: en.ts; `npm test` # fail 0, tsc, build. Commit «NOVA: voz propia, interruptor NOVA habla y lectura por partes».

### Task 3 addendum (owner request 2026-11-16): «Ajustes de NOVA»
- Gear button in NOVA's header opens a small panel «Ajustes de NOVA» with: voice choice among the Aura-2 voices of `lib/voices.ts` for the current language (no «Básica»), each with «Probar» (speaks «Hola, soy NOVA. ¿Qué creamos hoy?»); toggle «NOVA habla»; toggle «Sugerencias» (off = no idle bubbles). All persisted with `usePersistentState` keys `nova:voz`, `nova:habla`, `nova:sugerencias`. Default voice: es «es-estrella», en «en-luna».
- `/api/nova/voz` accepts `voice` but only ids of Aura-2 voices from `lib/voices.ts` (`findVoice`, not `basic`); anything else → the default for the language.
