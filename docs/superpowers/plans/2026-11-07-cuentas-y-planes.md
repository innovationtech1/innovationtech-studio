# Cuentas y planes de pago — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Studio funcione como servicio por suscripción: inicio de sesión con Firebase, un negocio por cuenta (con equipo en Pro), planes Básico/Pro con herramientas y límites diarios aplicados en el servidor, cobro con Stripe y activación manual por el administrador.

**Architecture:** Un guardián del servidor (`requireAccess`) que cada ruta `/api/*` llama antes de trabajar; lee usuario, negocio y configuración desde Firestore (proyecto `innovationtech-nova`) a través de una interfaz `AccountStore` (implementación real con `firebase-admin` y una falsa en memoria para las pruebas). En el navegador, el SDK de Firebase Auth inicia sesión y un envoltorio de `fetch` agrega el token a cada `/api/*`. Stripe avisa por webhook y una función pura traduce cada evento a cambios del negocio. Todo queda detrás de `STUDIO_CUENTAS=on`.

**Tech Stack:** Next.js 15 (App Router, TypeScript), `firebase` (web), `firebase-admin` (Firestore), `jose` (tokens), `stripe` (servidor), pruebas con `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-07-cuentas-y-planes-design.md`

## Global Constraints

- Precios: Básico **$19/mes**, Pro **$39/mes** (USD, mensual).
- Herramientas: `textos`, `asistente`, `imagenes`, `editor_imagenes`, `planeacion`, `musica` en todos los planes; `reels`, `editor_video`, `voz`, `subtitulos` solo en `pro` y `prueba`; `video_ia` solo en `pro` y **solo con clave propia de Replicate**.
- Límites por día (contadores `textos`, `imagenes`, `voces`, `subtitulos`): prueba 10/3/2/2 · básico 60/20/0/0 · pro 200/60/30/30.
- Prueba: **10 minutos** de Pro al crear el negocio. Personas: básico 1, pro 3.
- El día de los contadores es el de **`America/Chicago`** (formato `AAAA-MM-DD`).
- Pausa inmediata al cancelar o fallar el pago; no se borran datos.
- Métodos manuales: `efectivo`, `zelle`, `cashapp`, `otro`.
- Firestore: base `(default)`, colecciones con prefijo `studio_`; el navegador **nunca** lee ni escribe Firestore directamente.
- Ningún secreto con prefijo `NEXT_PUBLIC_`. Variables no secretas que deben ir en `SECRETS_SCAN_OMIT_KEYS` de Netlify: `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `STUDIO_ADMIN_EMAILS`, `CF_ACCOUNT_ID`, `STUDIO_CUENTAS`, `NEXT_PUBLIC_STUDIO_CUENTAS`.
- Con `STUDIO_CUENTAS` distinto de `on`, Studio se comporta **exactamente como hoy** (incluido el modo demo).
- Textos visibles en español (la traducción al inglés la hace el sistema existente de `lib/i18n.ts`).
- Códigos de error del guardián: 401 `SESION`, 403 `PAUSADO`, 403 `SIN_PLAN`, 403 `PLAN`, 403 `CLAVE_PROPIA`, 429 `LIMITE`.

## Review Focus

1. **Cambio de día y horario de verano en San Antonio:** un uso a las 23:59 y otro a las 00:01 hora de Chicago caen en días distintos, también el día del cambio de horario. → prueba en Task 1.
2. **Dos pedidos al mismo tiempo cerca del límite** (por ejemplo, el miembro y el dueño piden la imagen 20 a la vez): solo uno pasa. → prueba en Task 3.
3. **Token vencido a mitad del uso** (los tokens de Firebase duran 1 hora): el envoltorio de `fetch` renueva el token y reintenta una vez, sin cerrar la sesión. → prueba en Task 6.
4. **Avisos de Stripe repetidos o desordenados** (llega `subscription.updated` viejo después de `deleted`): el negocio queda en el último estado real. → prueba en Task 8.
5. **Correos con mayúsculas** en invitaciones y en `STUDIO_ADMIN_EMAILS` (`Ana@Gmail.com` vs `ana@gmail.com`): se comparan en minúsculas. → pruebas en Tasks 3 y 5.

---

### Task 1: Reglas de planes (funciones puras) y entorno de pruebas

**Files:**
- Create: `lib/plans.ts`
- Test: `lib/plans.test.ts`
- Modify: `package.json` (script `"test": "tsx --test lib/**/*.test.ts"`, devDependency `tsx`)

**Interfaces:**
- Produces:
  - `type Plan = "prueba" | "basico" | "pro"`; `type Herramienta = "textos" | "asistente" | "imagenes" | "editor_imagenes" | "planeacion" | "musica" | "reels" | "editor_video" | "voz" | "subtitulos" | "video_ia"`; `type Contador = "textos" | "imagenes" | "voces" | "subtitulos"`.
  - `type PlanesConfig = { precios: Record<"basico"|"pro", { monto: number; stripePriceId?: string }>; herramientas: Record<Plan, Herramienta[]>; limites: Record<Plan, Record<Contador, number>>; personas: Record<"basico"|"pro", number>; pruebaMinutos: number }` y `const DEFAULT_CONFIG: PlanesConfig` (valores de Global Constraints).
  - `type Negocio = { id: string; nombre: string; duenoUid: string; miembros: string[]; plan: "basico"|"pro"|null; estado: "prueba"|"activo"|"pausado"; pruebaHasta?: number; origen: "stripe"|"manual"|null; pagadoHasta?: number; stripe?: { customerId?: string; subscriptionId?: string; status?: string; priceId?: string; ultimoEvento?: number }; creado: number; actualizado: number }` (fechas en milisegundos).
  - `type Efectivo = { estado: "prueba"|"activo"|"pausado"|"sin_plan"; plan: Plan | null }`.
  - `estadoEfectivo(n: Negocio, ahora: number): Efectivo` — reglas 4.1 del spec, en ese orden.
  - `puedeUsar(cfg: PlanesConfig, plan: Plan, h: Herramienta): boolean`
  - `limite(cfg: PlanesConfig, plan: Plan, c: Contador): number`
  - `diaChicago(ahora: number): string` — `Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" })`.

- [ ] **Step 1: Write the failing tests** in `lib/plans.test.ts`:
  - `estadoEfectivo`: prueba vigente → `{estado:"prueba", plan:"prueba"}`; prueba vencida → `{estado:"sin_plan", plan:null}`; `estado:"pausado"` → pausado aunque `stripe.status:"active"`; manual con `pagadoHasta` futuro → `{activo, basico}`; manual vencido → pausado; stripe `active` y `trialing` → activo; `past_due`, `unpaid`, `canceled`, `incomplete` → pausado.
  - `puedeUsar(DEFAULT_CONFIG,"basico","reels") === false`, `("pro","reels") === true`, `("prueba","voz") === true`, `("prueba","video_ia") === false`, `("basico","musica") === true`.
  - `limite(DEFAULT_CONFIG,"basico","imagenes") === 20`, `("pro","subtitulos") === 30`, `("prueba","textos") === 10`, `("basico","voces") === 0`.
  - `diaChicago(Date.parse("2026-11-07T05:59:00Z")) === "2026-11-06"` y `diaChicago(Date.parse("2026-11-07T06:01:00Z")) === "2026-11-07"`; cambio de horario: `diaChicago(Date.parse("2026-11-01T04:59:00Z")) === "2026-10-31"` y `diaChicago(Date.parse("2026-11-02T05:30:00Z")) === "2026-11-01"`.

- [ ] **Step 2: Run** `npm install -D tsx && npm test` — Expected: FAIL (`Cannot find module './plans'`).
- [ ] **Step 3: Implement** `lib/plans.ts` with the interfaces above.
- [ ] **Step 4: Run** `npm test` — Expected: all PASS. Also `npx tsc --noEmit -p .` — no errors.
- [ ] **Step 5: Commit** `git commit -m "Cuentas: reglas de planes, herramientas y límites (lib/plans)"`

---

### Task 2: Verificación de tokens de Firebase y conexión a Firestore

**Files:**
- Create: `lib/firebase-server.ts`, `lib/verify-token.ts`
- Test: `lib/verify-token.test.ts`
- Modify: `package.json` (dependencies `firebase-admin`, `jose`)

**Interfaces:**
- Produces:
  - `db(): Firestore` y `firestoreConfigurado(): boolean` en `lib/firebase-server.ts` (mismas variables y reemplazo de `\n` que `lib/firebaseAdmin.js` de NOVA; `import "server-only"`).
  - `verifyIdToken(token: string, opts?: { projectId?: string; jwks?: JWTVerifyGetKey; now?: number }): Promise<{ uid: string; email: string; emailVerified: boolean }>` — `jose.jwtVerify` con `createRemoteJWKSet("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")` por defecto, `issuer = https://securetoken.google.com/${projectId}`, `audience = projectId`, algoritmo `RS256`; `uid = sub`; `email` en minúsculas; lanza error si falta `sub`.

- [ ] **Step 1: Write the failing tests** with a key pair from `jose.generateKeyPair("RS256")` and `createLocalJWKSet`: token válido → `{uid:"u1", email:"ana@gmail.com"}` (el token trae `Ana@Gmail.com`); audiencia de otro proyecto → rechaza; vencido (`exp` en el pasado) → rechaza; firmado con otra llave → rechaza.
- [ ] **Step 2: Run** `npm install firebase-admin jose && npm test` — Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** `npm test` — PASS; `npx tsc --noEmit -p .` — sin errores.
- [ ] **Step 5: Commit** `git commit -m "Cuentas: verificación de tokens de Firebase y conexión a Firestore"`

---

### Task 3: Guardián del servidor y contadores de uso

**Files:**
- Create: `lib/account-store.ts` (interfaz + implementación Firestore), `lib/account-store-memory.ts` (falsa, para pruebas), `lib/account.ts`
- Test: `lib/account.test.ts`

**Interfaces:**
- Consumes: Task 1 (`estadoEfectivo`, `puedeUsar`, `limite`, `diaChicago`, tipos), Task 2 (`verifyIdToken`, `db`).
- Produces:
  - `interface AccountStore { getUsuario(uid): Promise<Usuario|null>; getNegocio(id): Promise<Negocio|null>; getConfig(): Promise<PlanesConfig>; reservarUso(negocioId, dia, c: Contador, unidades, tope): Promise<boolean>; devolverUso(negocioId, dia, c, unidades): Promise<void>; ... }` con `type Usuario = { uid; email; negocioId; rol: "dueno"|"miembro"; creado }`. `reservarUso` suma solo si `actual + unidades <= tope`, **dentro de una transacción** (`studio_uso/{negocioId}_{dia}`), y devuelve si pudo. Los métodos para Tasks 5, 7 y 8 se agregan en esas tareas.
  - `firestoreStore(): AccountStore` y `memoryStore(seed?): AccountStore` (la falsa serializa `reservarUso` para simular la transacción).
  - `cuentasActivas(): boolean` → `process.env.STUDIO_CUENTAS === "on"`.
  - `type Acceso = { ok: true; uid: string; negocio: Negocio; plan: Plan; contado: boolean; devolver: () => Promise<void> } | { ok: false; status: number; codigo: "SESION"|"PAUSADO"|"SIN_PLAN"|"PLAN"|"CLAVE_PROPIA"|"LIMITE"; mensaje: string }`.
  - `requireAccess(req: Request, o: { herramienta: Herramienta; contador?: Contador; unidades?: number; clavePropia: boolean }, deps?: { store?: AccountStore; verify?: typeof verifyIdToken; now?: number }): Promise<Acceso>`. Si `cuentasActivas()` es falso devuelve `{ ok: true, contado: false, ... }` sin leer nada (el modo demo actual sigue igual). `video_ia` sin `clavePropia` → `CLAVE_PROPIA`. Con `clavePropia` no reserva uso. Mensaje de `LIMITE`: «Llegaste al límite de hoy (N <contador>). Se reinicia a medianoche. Puedes pasarte a Pro o conectar tu propia cuenta para usarlo sin límite.»; en prueba: «Llegaste al límite de la prueba. Elige un plan para seguir creando.»
  - `jsonAcceso(a): Response` — `{ error: mensaje, codigo }` con su status.

- [ ] **Step 1: Write the failing tests** (`memoryStore`, `verify` falso, `STUDIO_CUENTAS=on`): sin encabezado `Authorization` → 401 `SESION`; negocio pausado → 403 `PAUSADO`; prueba vencida → 403 `SIN_PLAN`; básico pide `voz` → 403 `PLAN`; básico con 20 imágenes ya usadas pide 1 → 429 `LIMITE`; con `clavePropia:true` no cuenta (el contador sigue igual); `video_ia` en pro sin clave propia → 403 `CLAVE_PROPIA`; `devolver()` resta lo reservado; **dos `requireAccess` en paralelo con 19 imágenes usadas → exactamente uno `ok`**; `STUDIO_CUENTAS` sin definir → `ok` sin tocar el store.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** the three files. Token desde `Authorization: Bearer <token>`.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `git commit -m "Cuentas: guardián del servidor con planes, herramientas y límites"`

---

### Task 4: Conectar el guardián a las rutas de IA

**Files:**
- Modify: `lib/cf-auth.ts`, `app/api/text/route.ts`, `app/api/chat/route.ts`, `app/api/image/route.ts`, `app/api/voice/route.ts`, `app/api/transcribe/route.ts`, `app/api/video/route.ts`, `app/api/video/[id]/route.ts`
- Test: `lib/cf-auth.test.ts`

**Interfaces:**
- Consumes: Task 3 (`requireAccess`, `jsonAcceso`, `cuentasActivas`).
- Produces: `clavePropiaCF(req): boolean` (encabezados `x-cf-account` y `x-cf-token`). Con `cuentasActivas()`, `getCreds` ya no cuenta por IP: devuelve las credenciales del cliente o las de `CF_ACCOUNT_ID`/`CF_API_TOKEN`, y `refund` no hace nada (el uso se devuelve con `acceso.devolver()`).

Mapeo ruta → herramienta / contador / clave propia:
| Ruta | herramienta | contador | clavePropia |
|---|---|---|---|
| `/api/text` | `textos` | `textos` | CF o `x-anthropic-key` |
| `/api/chat` | `asistente` | `textos` | CF o `x-anthropic-key` |
| `/api/image` | `imagenes` | `imagenes` (unidades = cantidad pedida) | CF o `x-replicate-key` |
| `/api/voice` | `voz` | `voces` | CF |
| `/api/transcribe` | `subtitulos` | `subtitulos` | CF |
| `/api/video`, `/api/video/[id]` | `video_ia` | — | `x-replicate-key` |

- [ ] **Step 1: Write the failing tests:** con `STUDIO_CUENTAS=on`, `getCreds` sin encabezados del cliente devuelve las credenciales del entorno con `demo:false` y no aplica `DEMO_LIMIT`; sin la variable, el comportamiento actual de `DEMO_LIMIT` se mantiene (16.ª petición de texto con límite 15 → error `DEMO_LIMIT`).
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement** the change in `lib/cf-auth.ts`; in each route, call `requireAccess` first and return `jsonAcceso` if `!ok`; when the provider fails, call `acceso.devolver()` (en `/api/image`, devolver solo las que fallaron). Unir `transcribe` al contador `subtitulos` en lugar de `voice`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .` y `npm run build` — sin errores.
- [ ] **Step 5: Commit** `git commit -m "Cuentas: las rutas de IA pasan por el guardián"`

---

### Task 5: API de cuenta: crear negocio, estado y equipo

**Files:**
- Create: `lib/account-api.ts`, `app/api/cuenta/route.ts`, `app/api/cuenta/invitar/route.ts`, `app/api/cuenta/miembros/[uid]/route.ts`
- Modify: `lib/account-store.ts`, `lib/account-store-memory.ts` (agregar `crearNegocio`, `getInvitacion(email)`, `crearInvitacion`, `borrarInvitacion`, `unirMiembro`, `quitarMiembro`, `getUso(negocioId, dia)`)
- Test: `lib/account-api.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (handlers puros con `deps`, las rutas solo los envuelven):
  - `obtenerCuenta(uid, deps) → { usuario, negocio, efectivo: Efectivo, herramientas: Herramienta[], limites: Record<Contador,number>, uso: Record<Contador,number>, esAdmin: boolean, precios }` (o `{ usuario: null }` si es nuevo). `esAdmin` compara con `STUDIO_ADMIN_EMAILS` en minúsculas.
  - `crearCuenta(uid, email, nombreNegocio, deps)`: si hay invitación para `email` (minúsculas) y el negocio tiene cupo (`personas.pro`), lo une como `miembro` y borra la invitación; si no, crea negocio `{ plan:"pro", estado:"prueba", pruebaHasta: ahora + pruebaMinutos·60000, origen:null }`. Si el usuario ya existe, devuelve el existente (no crea otro). `nombreNegocio` obligatorio (1–80 caracteres) cuando no hay invitación.
  - `invitar(uid, email, deps)`: solo el dueño, solo plan `pro` efectivo, máximo `personas.pro - 1` invitados + miembros; error claro en cada caso.
  - `quitarMiembro(uid, miembroUid, deps)`: solo el dueño; no puede quitarse a sí mismo.

- [ ] **Step 1: Write the failing tests:** usuario nuevo crea negocio en prueba con `pruebaHasta = ahora + 600000`; segunda llamada no crea otro; invitado `Ana@Gmail.com` + registro como `ana@gmail.com` → se une como miembro; con 3 personas no se puede invitar a una cuarta; básico no puede invitar; un miembro no puede invitar; `obtenerCuenta` de un admin en `STUDIO_ADMIN_EMAILS="Hector@X.com"` con correo `hector@x.com` → `esAdmin:true`.
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement** handlers and routes (las rutas verifican el token con `verifyIdToken` y responden 401 `SESION` sin él).
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .` — PASS.
- [ ] **Step 5: Commit** `git commit -m "Cuentas: crear negocio, estado de la cuenta y equipo Pro"`

---

### Task 6: Inicio de sesión y pantallas en el navegador

**Files:**
- Create: `lib/firebase-client.ts`, `lib/auth-fetch.ts`, `app/account-gate.tsx`, `app/account-screens.tsx` (bienvenida, crear negocio, elegir plan, pausado, mi cuenta), `app/trial-banner.tsx`
- Modify: `app/layout.tsx` o `app/page.tsx` (envolver con `AccountGate` solo si `process.env.NEXT_PUBLIC_STUDIO_CUENTAS === "on"`), `app/page.tsx` (etiqueta «Pro» y botón «Mejorar a Pro» en reels, editor de video, voz y subtítulos según `herramientas`; mensajes de los códigos `LIMITE`, `PAUSADO`, `PLAN`), `app/globals.css`, `package.json` (dependency `firebase`)
- Test: `lib/auth-fetch.test.ts`

**Interfaces:**
- Consumes: Task 5 (`GET/POST /api/cuenta`, `POST /api/cuenta/invitar`, `DELETE /api/cuenta/miembros/[uid]`); Task 8 rutas `/api/stripe/checkout` y `/api/stripe/portal` (los botones se agregan aquí y se activan cuando existan).
- Produces:
  - `lib/firebase-client.ts`: `auth()`, `entrarConGoogle()` (popup; si falla con `auth/popup-blocked` o en modo app instalada en iPhone, `signInWithRedirect`), `entrarConCorreo(email, clave)`, `crearConCorreo(email, clave)`, `recuperarClave(email)`, `salir()`. Config con `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
  - `installAuthFetch(getToken: (forzar: boolean) => Promise<string | null>): () => void` — reemplaza `window.fetch` solo para URLs del mismo origen que empiezan con `/api/` (excepto `/api/stripe/webhook`): agrega `Authorization: Bearer <token>`; si la respuesta es 401 con `codigo:"SESION"`, pide `getToken(true)` y **reintenta una vez**. Devuelve la función que deshace el cambio.
  - `useCuenta(): { cargando, cuenta, refrescar }` (contexto de React, lee `GET /api/cuenta` y refresca cada 60 s y al volver a la pestaña).
  - Pantallas según `efectivo.estado`: sin sesión → bienvenida; sin usuario → crear negocio; `sin_plan` → elegir plan (Básico $19, Pro $39 y el texto de pago manual con correo y WhatsApp de InnovationTECH); `pausado` → aviso con «Pagar para reactivar» y acceso de solo lectura a galería y Mi marca; `prueba` → `TrialBanner` con cuenta regresiva `mm:ss`.

- [ ] **Step 1: Write the failing tests** for `installAuthFetch` (con un `fetch` falso): agrega el encabezado a `/api/text`; no lo agrega a `https://otro.com/api/x` ni a `/api/stripe/webhook`; ante 401 `SESION` pide token forzado y reintenta una vez; ante un segundo 401 devuelve esa respuesta sin más reintentos.
- [ ] **Step 2: Run** `npm install firebase && npm test` — FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build` — sin errores. Con `NEXT_PUBLIC_STUDIO_CUENTAS` sin definir, `npm run build` y la app se ven igual que antes.
- [ ] **Step 5: Manual check** en la versión de prueba de Netlify con ambas variables en `on`: entrar con Google y con correo, crear negocio, ver la cuenta regresiva, esperar 10 min → «Elige tu plan»; recargar la página no reinicia la prueba.
- [ ] **Step 6: Commit** `git commit -m "Cuentas: inicio de sesión y pantallas por estado de la cuenta"`

---

### Task 7: Panel mínimo del administrador y pagos a mano

**Files:**
- Create: `lib/admin-api.ts`, `app/api/admin/negocios/route.ts`, `app/api/admin/negocios/[id]/route.ts`, `app/admin/page.tsx`
- Modify: `lib/account-store.ts`, `lib/account-store-memory.ts` (agregar `listarNegocios()`, `actualizarNegocio(id, cambios)`, `registrarPagoManual(pago)`, `listarPagosManuales(negocioId)`)
- Test: `lib/admin-api.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, 5.
- Produces:
  - `esAdmin(email): boolean` (minúsculas, `STUDIO_ADMIN_EMAILS` separado por comas).
  - `listar(deps) → Array<{ negocio, efectivo, dueno: string, usoHoy: Record<Contador,number> }>`.
  - `activarManual(negocioId, { plan, hasta: number, monto: number, metodo: "efectivo"|"zelle"|"cashapp"|"otro", nota?: string }, adminEmail, deps)` → `estado:"activo", origen:"manual", pagadoHasta:hasta` y agrega el pago a `studio_pagos_manuales`. Rechaza `hasta` en el pasado y `monto < 0`.
  - `pausar(negocioId, deps)` y `reactivar(negocioId, deps)`; `reactivar` en origen `stripe` solo si `stripe.status` es `active` o `trialing`.
  - `app/admin/page.tsx`: lista con buscador, estado efectivo, vencimiento, uso de hoy, y los botones «Activar plan», «Pausar», «Reactivar» (y «Preparar Stripe», que se conecta en Task 8). Si el correo no es admin, la ruta responde 403 y la página dice «No tienes permiso».

- [ ] **Step 1: Write the failing tests:** un no-admin recibe 403; `activarManual` con `metodo:"cashapp"` deja `estadoEfectivo` en `activo` y guarda el pago; al pasar `hasta`, `estadoEfectivo` da `pausado`; `hasta` en el pasado → error; `reactivar` un negocio de Stripe con `status:"past_due"` → error.
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement** handlers, routes and page.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build` — sin errores.
- [ ] **Step 5: Commit** `git commit -m "Cuentas: panel mínimo del administrador y pagos a mano"`

---

### Task 8: Stripe: precios, pago, portal y avisos

**Files:**
- Create: `lib/stripe-server.ts`, `lib/stripe-events.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/admin/stripe/route.ts`
- Modify: `lib/account-store.ts`, `lib/account-store-memory.ts` (agregar `eventoProcesado(id): Promise<boolean>` sobre `studio_stripe_eventos/{id}`, `guardarConfig(parcial)`, `negocioPorCustomer(customerId)`), `app/admin/page.tsx` (botón «Preparar Stripe»), `package.json` (dependency `stripe`)
- Test: `lib/stripe-events.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 5, 7.
- Produces:
  - `stripe(): Stripe` (con `STRIPE_SECRET_KEY`).
  - `prepararStripe(deps)`: crea (si no existen, buscando por `lookup_key` `studio_basico_mensual` / `studio_pro_mensual`) los productos «Studio Básico» y «Studio Pro» con precios mensuales de 1900 y 3900 centavos USD, y guarda los `priceId` con `guardarConfig`.
  - `crearCheckout(negocio, email, plan, origin)`: `mode:"subscription"`, `client_reference_id = negocio.id`, `customer` si existe o `customer_email`, `success_url = ${origin}/?pago=ok`, `cancel_url = ${origin}/?pago=cancelado`, `metadata.negocioId`. **Sin** `payment_method_types`: los métodos salen de la configuración de Stripe, así el dueño puede encender **Cash App Pay** desde su panel de Stripe sin tocar código. Solo el dueño del negocio puede pagar.
  - `crearPortal(negocio, origin)` → URL del portal de clientes.
  - `aplicarEvento(evento: Stripe.Event, negocio: Negocio, cfg: PlanesConfig): Partial<Negocio> | null` (función pura): `checkout.session.completed` → `stripe.customerId/subscriptionId`, `origen:"stripe"`; `customer.subscription.created|updated` → `plan` según `priceId` (comparando con `cfg.precios`), `stripe.status`, `estado` activo si `active|trialing`, si no pausado; `customer.subscription.deleted` → `estado:"pausado"`, `stripe.status:"canceled"`; `invoice.payment_failed` → `estado:"pausado"`; `invoice.paid` → `estado:"activo"`. Devuelve `null` si `evento.created * 1000 < (negocio.stripe?.ultimoEvento ?? 0)` (desordenado) y siempre escribe `stripe.ultimoEvento`.
  - Webhook: `stripe.webhooks.constructEvent(await req.text(), firma, STRIPE_WEBHOOK_SECRET)`; 400 si la firma no vale; ignora el evento si `eventoProcesado(id)` ya es verdadero; busca el negocio por `client_reference_id`, `metadata.negocioId` o `customer`.

- [ ] **Step 1: Write the failing tests** for `aplicarEvento` and the webhook handler (eventos firmados con `stripe.webhooks.generateTestHeaderString` y un secreto de prueba): checkout completado guarda ids; subscription `active` con el priceId de Pro → `plan:"pro", estado:"activo"`; `past_due` → pausado; `deleted` → pausado; `invoice.paid` después de pausa → activo; **`updated` con `created` anterior a un `deleted` ya aplicado → sin cambios**; el mismo evento dos veces → se aplica una sola vez; firma inválida → 400.
- [ ] **Step 2: Run** `npm install stripe && npm test` — FAIL.
- [ ] **Step 3: Implement** the files above and connect the «Elegir Básico/Pro», «Administrar suscripción» y «Pagar para reactivar» buttons of Task 6 to `/api/stripe/checkout` and `/api/stripe/portal`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build` — sin errores.
- [ ] **Step 5: Manual check** en la versión de prueba de Netlify con Stripe en **modo de prueba**: «Preparar Stripe»; pagar Básico con `4242 4242 4242 4242`; mejorar a Pro en el portal; tarjeta `4000 0000 0000 0341` → pausa; pagar → reactiva; cancelar en el portal → pausa inmediata.
- [ ] **Step 6: Commit** `git commit -m "Cuentas: cobros con Stripe (pago, portal y avisos)"`

---

### Task 9: Documentación, variables y lanzamiento

**Files:**
- Modify: `README.md` (sección «Cuentas y planes»: variables de entorno, pasos en Firebase y Stripe —incluido el portal de clientes con **cancelación inmediata sin reembolso**, los eventos del webhook y Cash App Pay opcional—, `SECRETS_SCAN_OMIT_KEYS`, cómo encender `STUDIO_CUENTAS`), `CONTRIBUTING.md` (`npm test`), `public/sw.js` (no guardar en caché respuestas de `/api/cuenta` ni `/api/stripe/*`)
- Test: lista de verificación de punta a punta del spec (sección 9), en la versión de prueba de Netlify.

- [ ] **Step 1:** Actualizar README y CONTRIBUTING con lo anterior; revisar que `public/sw.js` no guarde respuestas de `/api/*` (si guarda, excluir `/api/cuenta` y `/api/stripe/`).
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build` — sin errores.
- [ ] **Step 3: Manual check** completo (spec, sección 9) en la versión de prueba de Netlify, incluida la activación manual con Cash App y su pausa al vencer.
- [ ] **Step 4: Commit** `git commit -m "Cuentas: documentación y preparación del lanzamiento"`
- [ ] **Step 5:** Con aprobación del dueño: `STUDIO_CUENTAS=on` y `NEXT_PUBLIC_STUDIO_CUENTAS=on` en producción, nueva publicación y prueba rápida; después, cambiar Stripe a claves reales.
