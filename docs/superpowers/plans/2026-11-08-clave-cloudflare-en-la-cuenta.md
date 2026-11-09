# Clave de Cloudflare en la cuenta · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El dueño conecta su Cloudflare una vez; se guarda cifrada en el servidor y la usan todos sus dispositivos y su equipo, sin límites del mes.

**Architecture:** Un módulo puro de cifrado (`lib/cifrado.ts`), una tienda para el documento cifrado (`claves_ia/{negocioId}`), una API de cuenta (POST/DELETE `/api/cuenta/clave-ia`), y `requireAccess` que devuelve la clave guardada descifrada para que `getCreds` la use cuando el navegador no manda la suya.

**Tech Stack:** Next.js 15, TypeScript, `node:crypto` (AES-256-GCM), firebase-admin, node:test.

**Spec:** `docs/superpowers/specs/2026-11-08-clave-cloudflare-en-la-cuenta-design.md`

## Global Constraints

- Llave: `process.env.STUDIO_CLAVES_SECRETO`, base64 de exactamente 32 bytes. Cifrado AES-256-GCM, IV 12 bytes aleatorio por guardado; documento `{ version: 1, iv, tag, datos }` en base64; `datos` cifra `JSON.stringify({ accountId, token })`.
- Colección `colecciones().clavesIa` = `${prefijo}claves_ia`, documento por `negocioId`.
- `Negocio.iaPropia?: { cuentaFin: string; conectada: number }` — nunca el token ni el Account ID completo.
- Orden: encabezados del navegador > clave guardada > cuenta de InnovationTECH. Con las dos primeras no se cuenta ni se gasta saldo.
- Copias exactas: 503 «Falta configurar el guardado seguro de claves. Avísale a InnovationTECH.»; Mi cuenta ilegible «Tu Cloudflare conectado ya no se puede leer. Conéctalo otra vez.»; conectada «Conectada (cuenta …${cuentaFin}) · Sin límites del mes»; miembro «Tu negocio usa su propia cuenta de Cloudflare.»; desconectar confirmación «¿Desconectar tu cuenta de Cloudflare? Studio volverá a usar la IA de InnovationTECH con los límites de tu plan.».
- Nada de secretos en registros (`console.*` solo con negocioId y códigos).
- Textos nuevos de la interfaz con entrada en `lib/locales/en.ts`. Sin dependencias nuevas. `npm test` `# fail 0`, `npx tsc --noEmit` limpio, `npm run build` compila.

## Review Focus

1. **Llave ausente o cambiada**: los pedidos de IA siguen funcionando con la cuenta de InnovationTECH y con límites; nunca un 500. → prueba en Task 2.
2. **Miembro del equipo** intentando conectar o desconectar → 403. → prueba en Task 2.
3. **El token nunca sale del servidor**: ni en `/api/cuenta`, ni en errores, ni en registros. → prueba en Task 2 (buscar el token en el JSON de respuesta).
4. **Ruta de Replicate (video IA)** no debe tomar la clave de Cloudflare como «clave propia». → prueba en Task 2.
5. **Cuenta pausada o sin plan** con clave guardada: sigue bloqueada (la clave propia no salta el plan). → prueba en Task 2.

---

### Task 1: Cifrado y almacenamiento

**Files:**
- Create: `lib/cifrado.ts`, `lib/cifrado.test.ts`
- Modify: `lib/colecciones.ts` (+ test), `lib/account-store.ts`, `lib/account-store-memory.ts`, `lib/plans.ts` (tipo `Negocio.iaPropia`), `lib/account-store.test.ts`

**Interfaces:**
- Produces:
  - `type ClaveIA = { accountId: string; token: string }`
  - `type Cifrado = { version: 1; iv: string; tag: string; datos: string }`
  - `llaveDeEntorno(): Buffer | null` (null si falta o no mide 32 bytes; `console.error` una vez si mide mal)
  - `cifrarClave(c: ClaveIA, llave: Buffer): Cifrado`
  - `descifrarClave(x: Cifrado, llave: Buffer): ClaveIA | null` (null ante cualquier error)
  - `AccountStore.guardarClaveIA(negocioId: string, x: Cifrado): Promise<void>`, `leerClaveIA(negocioId): Promise<Cifrado | null>`, `borrarClaveIA(negocioId): Promise<void>`

- [ ] **Step 1: Tests** — ida y vuelta; dos cifrados del mismo dato tienen `iv` distinto; `datos` alterado → null; otra llave → null; `llaveDeEntorno` con 31 bytes → null; store en memoria guarda/lee/borra; `colecciones()` incluye `prueba_studio_claves_ia` con prefijo.
- [ ] **Step 2: Run, verify fail. Step 3: Implement. Step 4: `npm test` + tsc pass.**
- [ ] **Step 5: Commit** «Claves: cifrado AES-GCM y guardado aparte»

### Task 2: API de cuenta y uso en los pedidos de IA

**Files:**
- Create: `app/api/cuenta/clave-ia/route.ts`
- Modify: `lib/account-api.ts` (`conectarClaveIA`, `desconectarClaveIA`, `EstadoCuenta.iaPropia`), `app/api/cf-test/route.ts` (sacar la revisión a `lib/probar-cloudflare.ts` para reutilizarla, con `fetch` inyectable), `lib/account.ts` (`requireAccess`), `lib/cf-auth.ts` (`getCreds`), rutas `app/api/{text,chat,image,voice,transcribe}/route.ts`
- Test: `lib/account-api.test.ts`, `lib/account.test.ts`, `lib/cf-auth.test.ts`, `lib/probar-cloudflare.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `probarCloudflare(accountId: string, token: string, f?: typeof fetch): Promise<{ ok: boolean; checks: Check[] }>` (misma lógica y textos de hoy).
  - `conectarClaveIA(uid, datos: { accountId: unknown; token: unknown }, deps?: DepsCuenta & { probar?: typeof probarCloudflare; llave?: Buffer | null }): Promise<{ ok: true; cuentaFin: string } | (Falla & { checks?: Check[] })>`
  - `desconectarClaveIA(uid, deps?): Promise<{ ok: true } | Falla>`
  - `EstadoCuenta.iaPropia: { cuentaFin: string; conectada: number; legible: boolean } | null`
  - `OpcionesAcceso` gana `cloudflare?: boolean` (la ruta va a usar Cloudflare); `Acceso` ok gana `cfGuardada?: ClaveIA`. Si `cloudflare` y no hay encabezados propios y el negocio tiene `iaPropia` y se descifra → `clavePropia` efectiva = true (no cuenta) y devuelve `cfGuardada`.
  - `getCreds(req, kind, units?, guardada?: ClaveIA)` usa `guardada` cuando no hay encabezados.
- [ ] **Step 1: Tests** — los 5 de Review Focus más: conectar con prueba fallida → 400 con `checks` y nada guardado; conectar ok → `iaPropia.cuentaFin` = últimos 4 y documento cifrado legible; sin llave → 503 exacto; desconectar borra ambos; `obtenerCuenta` no contiene el token (buscar el string del token en `JSON.stringify(cuenta)`); `legible:false` con llave distinta; encabezados del navegador ganan sobre la guardada.
- [ ] **Step 2–4:** fail → implement → pass (`npm test`, tsc).
- [ ] **Step 5: Commit** «Claves: conectar Cloudflare en la cuenta y usarla en la IA»

### Task 3: Pantallas, guía y traducciones

**Files:**
- Modify: `app/account-screens.tsx` (Mi cuenta), `app/setup-wizard.tsx`, `app/page.tsx` (si hace falta pasar la cuenta al asistente), `lib/limpiar-dispositivo.ts` (sin cambios de comportamiento), `lib/locales/en.ts`, `README.md`
- [ ] **Step 1:** Mi cuenta: sección de la spec para dueño y miembro; «Desconectar» con el `Confirmar` compartido y la copia exacta; aviso de ilegible; «Guardar en tu cuenta» si hay clave local y la cuenta no tiene.
- [ ] **Step 2:** Asistente: con cuentas activas y dueño, el guardado final hace POST `/api/cuenta/clave-ia`, muestra los `checks` si falla, y al lograrlo borra `cfAccountId`/`cfToken` del navegador. Miembros no ven el asistente de conexión.
- [ ] **Step 3:** README: qué es, cómo conectarla, la variable `STUDIO_CLAVES_SECRETO` con el comando de PowerShell de la spec, y qué pasa si se cambia.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm test`, `npm run build`. Commit «Pantallas: conectar Cloudflare una sola vez».
