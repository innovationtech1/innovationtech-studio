# Compartir y Guardar en Google Drive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add «Compartir» (system share sheet) and «Guardar en Google Drive» (user's own Drive, `drive.file`) next to every «Descargar» of a finished result in Studio.

**Architecture:** Pure helpers in `lib/compartir.ts` (share-or-download decision, Blob from URL) and `lib/drive.ts` (Drive REST calls with injected `fetch`: folder, resumable upload in 8 MiB chunks, error mapping). Browser-only Google Identity Services token loader in `lib/google-token.ts`. One reusable UI component `app/compartir-botones.tsx` used by the reel studio, the gallery and the image editor. Nothing passes through our server.

**Tech Stack:** Next.js 15 App Router, TypeScript, React client components, `node:test` (`npm test`), Google Identity Services (script `https://accounts.google.com/gsi/client`), Google Drive REST v3.

**Spec:** `docs/superpowers/specs/2026-11-15-compartir-y-drive-design.md`

## Global Constraints
- No new npm dependencies. No server routes. No tokens stored (memory only) or logged.
- Drive scope exactly `https://www.googleapis.com/auth/drive.file`.
- Public config `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; when empty, the Drive button is not rendered.
- Drive folder name exactly «InnovationTECH Studio»; its id cached in `localStorage` key `drive:carpeta` (wrapped in try/catch).
- Resumable chunk size 8 MiB (8 × 1024 × 1024, a multiple of 256 KiB); one retry per chunk after 1.5 s.
- Every new Spanish UI string has an English entry in `lib/locales/en.ts` (EN for fixed text, EN_PATTERNS for text with numbers).
- Mobile first (~375 px), existing classes (`btn`, `ghost`, `small`, `notice`) and brand palette; icons from `lucide-react` (already a dependency).
- Cancelling the share sheet (`AbortError`) is never shown as an error.
- Commits in Spanish ending with the session trailer; never push.

## Review Focus
1. A huge video (≥ 500 MB) on a phone: upload streams chunk by chunk (`blob.slice`), never reads the whole file into memory. → Task 2 test `subirTrozos solo lee un trozo a la vez`.
2. Network drop mid-upload: the next chunk resumes from the server's confirmed `Range`, not from where the client thought it was. → Task 2 test `subirTrozos retoma desde el Range confirmado`.
3. Token expired between taps (401 from Drive): ask for a new token once and retry the save, with `prompt: ""` so Google can skip the consent screen. → Task 2 test `guardarEnDrive con token vencido…`.
4. Remote gallery URL blocked by CORS: Compartir/Drive must not appear broken; the item keeps only «Descargar». → Task 1 test `aArchivo con fetch que falla devuelve null`.
5. User taps Drive twice quickly: only one upload runs. → Task 3 Step 2 (button disabled while busy plus a guard in the handler).

---

### Task 1: Compartir (share sheet with download fallback)

**Files:**
- Create: `lib/compartir.ts`, `lib/compartir.test.ts`, `app/compartir-botones.tsx`
- Modify: `app/reel-studio.tsx` (~1668 «Descargar video», ~1696 «Descargar portada»), `app/page.tsx` (gallery ~1260 and ~1296), `app/image-editor.tsx:873-877`, `app/carousel-studio.tsx:280-295`, `app/globals.css`, `lib/locales/en.ts`

**Interfaces:**
- Produces:
  - `type ResultadoCompartir = "compartido" | "cancelado" | "descargar"`
  - `compartirArchivos(archivos: File[], texto?: string, nav?: { share: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean }): Promise<ResultadoCompartir>` — if `canShare({ files })` is true: copy `texto` to the clipboard when present (ignore failures), then `share({ files, text })`; `AbortError` → `"cancelado"`; any other error, or no/false `canShare` → `"descargar"`.
  - `aArchivo(src: Blob | string, nombre: string, f?: typeof fetch): Promise<File | null>` — Blob → File keeping its type; string (`data:`, `blob:`, https) → fetch → File; fetch failure or non-ok → `null`.
  - `descargarArchivo(archivo: File): void` — temporary object URL + `<a download>`, revoked after the click.
  - React: `<CompartirBotones src={Blob | string} nombre={string} texto?={string} compacto?={boolean} />` — renders «Compartir» (lucide `Share2`); Task 3 adds the Drive button inside it. `compacto` = icon-only buttons with `title`, for the gallery row.

- [ ] **Step 1: Write failing tests in `lib/compartir.test.ts`**
  - `compartirArchivos comparte cuando el navegador puede` → fake nav with `canShare: () => true` recording the `share` argument; result `"compartido"`, `files.length === 1`, `text === "Hola"`.
  - `compartirArchivos: cancelar no es error` → `share` rejects with `Object.assign(new Error("x"), { name: "AbortError" })` → `"cancelado"`.
  - `compartirArchivos sin canShare o con canShare falso → descargar` (two cases) → `"descargar"`.
  - `compartirArchivos: otro error → descargar`.
  - `aArchivo con Blob conserva tipo y nombre` → `type === "video/mp4"`, `name === "reel.mp4"`.
  - `aArchivo con fetch que falla devuelve null` (rejected and `ok: false` cases).
- [ ] **Step 2:** Run `node --conditions=react-server --import tsx --test lib/compartir.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `lib/compartir.ts` (no DOM access at import time).
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Build `app/compartir-botones.tsx` (`"use client"`). On tap: `aArchivo` → `compartirArchivos`. On `"descargar"`: `descargarArchivo` + notice «Tu navegador no deja compartir este archivo: lo descargamos. Súbelo desde tu aparato a la red que quieras.». On `"compartido"` with texto: notice «Se copió el texto para publicar: pégalo en la descripción.». While preparing: label «Preparando…», disabled. If `aArchivo` returns null: hide the buttons for that item from then on.
- [ ] **Step 6:** Wire it:
  - `reel-studio.tsx`: next to «Descargar video» with `src` = the result (the blob URL fetches fine, or keep the Blob in state), `nombre` = `reel-innovationtech.${result.ext}`; next to «Descargar portada» with the cover image.
  - `page.tsx` gallery: both download spots; `compacto` in the row, normal in the open viewer; `nombre` = the existing download name.
  - `image-editor.tsx`: replace the inline share (873-877) with `compartirArchivos` + `descargarArchivo` fallback (same behavior).
  - `carousel-studio.tsx`: keep its multi-file flow and messages, but call `compartirArchivos(files, caption)`; map `"descargar"` to its existing «…Usa «Descargar (.zip)».» error and `"cancelado"` to nothing.
- [ ] **Step 7:** Add en.ts entries for «Compartir», «Preparando…» and the two notices. Run `npm test` (# fail 0), `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 8:** Commit «Compartir: menú del teléfono o de la computadora junto a cada Descargar».

### Task 2: Cliente de Google Drive (lógica pura)

**Files:**
- Create: `lib/drive.ts`, `lib/drive.test.ts`
- Modify: `lib/locales/en.ts`

**Interfaces:**
- Produces:
  - `const TROZO = 8 * 1024 * 1024`
  - `class ErrorDrive extends Error { codigo: "TOKEN" | "LLENO" | "PERMISO" | "RED" | "OTRO" }` with these Spanish messages:
    - TOKEN «Tu sesión de Google venció. Vuelve a intentarlo.» (401)
    - LLENO «Tu Google Drive está lleno. Libera espacio y vuelve a intentarlo.» (403 with reason `storageQuotaExceeded` in the JSON body)
    - PERMISO «Google no dio permiso para guardar en tu Drive.» (other 403)
    - RED «Se perdió la conexión al subir a Drive. Vuelve a intentarlo.»
    - OTRO «No se pudo guardar en Google Drive.»
  - `errorDrive(status: number, cuerpo: string): ErrorDrive`
  - `carpetaDrive(token: string, f: typeof fetch, guardada?: string | null): Promise<string>` — with `guardada`: GET `https://www.googleapis.com/drive/v3/files/{id}?fields=id,trashed`, reuse when ok and not trashed; else search `q = name='InnovationTECH Studio' and mimeType='application/vnd.google-apps.folder' and trashed=false` (`fields=files(id)`), reuse the first; else POST to create the folder. Returns the id.
  - `iniciarSubida(token: string, datos: { nombre: string; tipo: string; tamano: number; carpeta: string }, f: typeof fetch): Promise<string>` — POST `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink` with `Authorization: Bearer …`, `Content-Type: application/json; charset=UTF-8`, `X-Upload-Content-Type`, `X-Upload-Content-Length`; body `{ name, parents: [carpeta] }`; returns the `Location` header.
  - `subirTrozos(url: string, blob: Blob, op: { f: typeof fetch; alProgreso?: (pct: number) => void; senal?: AbortSignal; trozo?: number; esperar?: (ms: number) => Promise<void> }): Promise<{ id: string; webViewLink: string }>` — PUT `blob.slice(inicio, fin)` with `Content-Range: bytes inicio-(fin-1)/total`. 308 → next start = last byte of the `Range` header + 1 (0 if no `Range`). 200/201 → parse JSON. Network error or 5xx → wait 1.5 s, query the status with an empty PUT and `Content-Range: bytes */total`, resume from its `Range`; a second consecutive failure at the same start → `ErrorDrive("RED")`. 4xx → `errorDrive`. `alProgreso` gets integers 0–100. Abort → rethrow the `AbortError`.
  - `type Token = () => Promise<string>`; `guardarEnDrive(blob: Blob, nombre: string, op: { token: Token; tokenNuevo: Token; f: typeof fetch; carpetaGuardada?: string | null; guardarCarpeta?: (id: string) => void; alProgreso?: (pct: number) => void; senal?: AbortSignal; esperar?: (ms: number) => Promise<void> }): Promise<{ id: string; webViewLink: string }>` — folder → start → chunks; on an `ErrorDrive` TOKEN at any point, once: `tokenNuevo()` and restart from the folder step.

- [ ] **Step 1: Write failing tests in `lib/drive.test.ts`** (fake `fetch` recording requests; `esperar` resolves immediately):
  - `carpetaDrive reutiliza la guardada`, `…busca por nombre`, `…crea la carpeta cuando no hay` (assert the POST body has the folder mimeType and name «InnovationTECH Studio»), `…ignora la guardada si está en la papelera`.
  - `iniciarSubida manda los encabezados y devuelve Location`.
  - `subirTrozos sube en trozos de 8 MiB con Content-Range correcto` (blob of 8 MiB + 10 bytes → two PUTs: `bytes 0-8388607/8388618`, `bytes 8388608-8388617/8388618`); progress ends at 100.
  - `subirTrozos solo lee un trozo a la vez` (each PUT body size ≤ TROZO; the full blob's `arrayBuffer` is never called).
  - `subirTrozos retoma desde el Range confirmado` (first PUT → 308 with `Range: bytes=0-4194303` → next PUT starts at 4194304).
  - `subirTrozos ante corte de red pregunta el estado y sigue`; `…dos fallos seguidos → RED`.
  - `errorDrive`: 401 → TOKEN, 403 `storageQuotaExceeded` → LLENO, other 403 → PERMISO, 500 → OTRO.
  - `guardarEnDrive con token vencido pide uno nuevo una vez y termina`; `…si vuelve a vencer, falla con TOKEN`.
- [ ] **Step 2:** Run `node --conditions=react-server --import tsx --test lib/drive.test.ts` → FAIL.
- [ ] **Step 3:** Implement `lib/drive.ts` (no DOM at import; never put the token in an error message).
- [ ] **Step 4:** Same command → PASS; `npm test` # fail 0.
- [ ] **Step 5:** Add the five ErrorDrive messages to `lib/locales/en.ts`. Commit «Google Drive: carpeta y subida reanudable por trozos».

### Task 3: Botón «Guardar en Google Drive», legal y guía

**Files:**
- Create: `lib/google-token.ts`
- Modify: `app/compartir-botones.tsx`, `app/globals.css`, `lib/drive.test.ts`, `lib/locales/en.ts`, `lib/legal.ts`, `lib/legal.test.ts`, `README.md`

**Interfaces:**
- Consumes: `guardarEnDrive`, `ErrorDrive` (Task 2); `aArchivo` (Task 1).
- Produces:
  - `enNavegadorDeApp(ua: string): boolean` — true for user agents containing `Instagram`, `FBAN`, `FBAV`, `FB_IAB`, `TikTok`, `musical_ly`, `Line/`.
  - `precargarGoogle(): Promise<void>` — inject `https://accounts.google.com/gsi/client` once (memoized promise).
  - `pedirToken(clientId: string, opciones?: { prompt?: "" | "consent" }): Promise<string>` — `google.accounts.oauth2.initTokenClient({ client_id, scope: "https://www.googleapis.com/auth/drive.file", callback, error_callback })` created once per page; `requestAccessToken({ prompt })` is called synchronously inside the tap (the button stays disabled with «Preparando…» until `precargarGoogle` resolves). Token + expiry kept in module memory and reused while more than 60 s remain. `error_callback` with `popup_failed_to_open` → reject with «Google no pudo abrir su ventana. Revisa que no estén bloqueadas las ventanas emergentes.»; `popup_closed` → treated as a cancel (no message).
  - `olvidarToken(): void` — clears the cached token.

- [ ] **Step 1:** Failing test in `lib/drive.test.ts`: `enNavegadorDeApp detecta Instagram, Facebook y TikTok y no Chrome ni Safari` (sample user agents). Run → FAIL. Implement in `lib/google-token.ts` (the pure function at the top; GIS code guarded by `typeof window`). Run → PASS.
- [ ] **Step 2:** In `CompartirBotones`, when `process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set: button «Guardar en Drive» (lucide `CloudUpload`). In an in-app browser → on tap show «Abre Studio en Chrome o Safari para guardar en Google Drive.». Otherwise: `precargarGoogle()` on mount; tap → `aArchivo` → `guardarEnDrive` with `token = () => pedirToken(id)` and `tokenNuevo = () => { olvidarToken(); return pedirToken(id, { prompt: "" }) }`, folder from/to `localStorage["drive:carpeta"]`. States: «Subiendo a Drive… {pct}%» with «Cancelar» (AbortController); then «Guardado en Drive» + link «Abrir en Drive» (`target="_blank" rel="noreferrer"`); or the error message with «Reintentar». Guard against double taps.
- [ ] **Step 3:** en.ts: «Guardar en Drive», «Guardado en Drive», «Abrir en Drive», «Cancelar» and «Reintentar» (if missing), the in-app and popup messages; EN_PATTERNS for «Subiendo a Drive… {pct}%».
- [ ] **Step 4:** `lib/legal.ts` Privacy (es + en, same meaning): when the user chooses «Guardar en Drive», the file is uploaded from their device to **their own** Google Drive with a permission limited to the files Studio creates; InnovationTECH does not receive or keep the Google token or a copy of the file. Bump `VERSION_LEGAL` and the dates to `"2026-11-15"` (or the next unused day); update `lib/legal.test.ts`.
- [ ] **Step 5:** README section «Guardar en Google Drive», simple Spanish: Google Cloud project `innovationtech-nova` → APIs & Services → enable «Google Drive API»; OAuth consent screen (External, app name, support email, logo, links to `/privacidad` and `/terminos`, scope `drive.file`, publish to production — non-sensitive scope, no long verification); Credentials → OAuth client ID «Web application» with authorized JavaScript origins `https://innovationtech-studio.netlify.app`, `https://pruebas--innovationtech-studio.netlify.app`, `http://localhost:3000`; Netlify env `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (not secret) → redeploy. Add the variable to the `SECRETS_SCAN_OMIT_KEYS` list in the README.
- [ ] **Step 6:** `npm test` # fail 0, `npx tsc --noEmit`, `npm run build`. Commit «Guardar en Google Drive: botón, aviso legal y guía».
