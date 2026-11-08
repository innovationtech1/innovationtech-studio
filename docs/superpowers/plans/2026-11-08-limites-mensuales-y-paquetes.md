# Límites mensuales y paquetes extra · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar los límites de uso de diarios a mensuales (reinicio el día 1, hora de Chicago) y vender paquetes extra (Creativo y Voz) con saldo que no vence, comprados con Stripe o agregados a mano.

**Architecture:** Las reglas puras (mes, reparto plan/saldo, configuración) viven en `lib/plans.ts`. El almacén reserva del contador del mes y del saldo del negocio en una sola transacción. El webhook existente acredita los paquetes con la misma marca de idempotencia de siempre. Las pantallas leen todo de `/api/cuenta`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, firebase-admin (Firestore), stripe@23.1.0 (API 2026-10-28.endive), node:test vía `npm test`.

**Spec:** `docs/superpowers/specs/2026-11-08-limites-mensuales-y-paquetes-design.md`

## Global Constraints

- Reinicio: día 1 de cada mes, medianoche **America/Chicago**. Clave de periodo `AAAA-MM`.
- Topes mensuales por defecto: prueba `{textos:10, imagenes:3, voces:2, subtitulos:2}`; básico `{textos:1000, imagenes:300, voces:0, subtitulos:0}`; pro `{textos:3000, imagenes:1000, voces:250, subtitulos:250}`.
- Paquete `creativo`: `{textos:500, imagenes:150}`, `monto: 5`, planes `["basico","pro"]`, lookup_key `studio_paquete_creativo`, producto «Studio Paquete Creativo».
- Paquete `voz`: `{voces:100, subtitulos:100}`, `monto: 9`, planes `["pro"]`, lookup_key `studio_paquete_voz`, producto «Studio Paquete Voz».
- Orden de gasto: primero lo del mes, después el saldo. Saldo nunca negativo, no vence.
- Configuración nueva en `limitesMes` (nunca leer `limites` como mensual) y `paquetes`.
- Clave propia de Cloudflare: no se cuenta ni se gasta saldo.
- Evento nuevo de Stripe: `checkout.session.async_payment_succeeded`.
- Textos de la interfaz en español (la app traduce sola). Sin dependencias nuevas.
- Todas las pruebas: `npm test` (debe terminar con `# fail 0`) y `npx tsc --noEmit` sin errores.

## Review Focus

1. **Fin de mes en UTC:** el 30 de noviembre a las 7 pm de Chicago ya es 1 de diciembre en UTC; debe seguir contando en noviembre. → prueba en Task 1.
2. **Pro que baja a Básico con saldo de Voz:** el saldo se guarda pero las voces siguen bloqueadas por plan, y no puede comprar otro paquete Voz. → pruebas en Task 3 y Task 6.
3. **Configuración vieja en Firestore con `limites` diarios** (60 textos): no debe convertirse en el tope mensual. → prueba en Task 1.
4. **Aviso de Stripe de pago de paquete con monto distinto, paquete desconocido o `unpaid`:** no acredita; y un `checkout.session.completed` de suscripción sigue funcionando igual. → pruebas en Task 5.
5. **«Quitar saldo» mayor que el saldo:** queda en 0, nunca negativo. → prueba en Task 4.

---

### Task 1: Reglas puras (mes, configuración, reparto)

**Files:**
- Modify: `lib/plans.ts`
- Test: `lib/plans.test.ts`

**Interfaces:**
- Produces:
  - `type Saldo = Partial<Record<Contador, number>>`
  - `type PaqueteId = "creativo" | "voz"`
  - `type PaqueteConfig = { monto: number; contenido: Saldo; planes: ("basico" | "pro")[]; stripePriceId?: string }`
  - `PlanesConfig` gana `limitesMes: Record<Plan, Record<Contador, number>>` y `paquetes: Record<PaqueteId, PaqueteConfig>`; se **quita** `limites`.
  - `Negocio` gana `paquetes?: Saldo`.
  - `mesChicago(ms: number): string` → `"AAAA-MM"`.
  - `inicioMesSiguienteChicago(ms: number): number` → ms de la medianoche de Chicago del día 1 siguiente.
  - `limiteMes(cfg, plan, c): number` (reemplaza a `limite`).
  - `repartirReserva(usadoMes: number, tope: number, saldo: number, unidades: number): { delMes: number; delSaldo: number } | null`
  - `sumarSaldo(saldo: Saldo | undefined, mas: Saldo, signo: 1 | -1): Saldo` (nunca baja de 0, quita claves en 0).
  - `esPaquete(x: unknown): x is PaqueteId`

- [ ] **Step 1: Write the failing tests**

```ts
test("mesChicago: 30 nov 7pm Chicago (1 dic UTC) sigue en noviembre", () => {
  assert.equal(mesChicago(Date.parse("2026-12-01T01:00:00Z")), "2026-11");
  assert.equal(mesChicago(Date.parse("2026-12-01T06:00:00Z")), "2026-12");
});
test("mesChicago: en horario de verano (31 oct 11:59pm CDT)", () => {
  assert.equal(mesChicago(Date.parse("2026-11-01T04:59:00Z")), "2026-10");
  assert.equal(mesChicago(Date.parse("2026-11-01T05:00:00Z")), "2026-11");
});
test("inicioMesSiguienteChicago: 8 nov → 1 dic 00:00 CST", () => {
  assert.equal(inicioMesSiguienteChicago(Date.parse("2026-11-08T18:00:00Z")), Date.parse("2026-12-01T06:00:00Z"));
});
test("repartirReserva", () => {
  assert.deepEqual(repartirReserva(0, 10, 0, 1), { delMes: 1, delSaldo: 0 });
  assert.deepEqual(repartirReserva(9, 10, 5, 3), { delMes: 1, delSaldo: 2 });
  assert.deepEqual(repartirReserva(10, 10, 5, 2), { delMes: 0, delSaldo: 2 });
  assert.equal(repartirReserva(10, 10, 1, 2), null);
  assert.equal(repartirReserva(12, 10, 0, 1), null); // tope bajado por el admin
});
test("sumarSaldo nunca baja de 0", () => {
  assert.deepEqual(sumarSaldo({ voces: 3 }, { voces: 10 }, -1), {});
  assert.deepEqual(sumarSaldo(undefined, { textos: 500, imagenes: 150 }, 1), { textos: 500, imagenes: 150 });
});
test("mezclarConfig ignora los límites diarios viejos", () => {
  const cfg = mezclarConfig({ limites: { basico: { textos: 60 } } } as never);
  assert.equal(cfg.limitesMes.basico.textos, 1000);
  assert.equal(cfg.paquetes.voz.monto, 9);
  assert.deepEqual(cfg.paquetes.voz.planes, ["pro"]);
});
```

- [ ] **Step 2: Run `npm test` and verify the new tests fail** (funciones no definidas).
- [ ] **Step 3: Implement in `lib/plans.ts`** con los valores de Global Constraints. `mesChicago` usa `Intl.DateTimeFormat` con `formatToParts` (como `diaChicago`). `inicioMesSiguienteChicago` reutiliza la búsqueda de medianoche de `finDelDiaChicago` en `lib/admin-api.ts` (mover la utilidad a `plans.ts` y que admin-api la importe). `mezclarConfig` mezcla `limitesMes` y `paquetes` (cada paquete con `{...default, ...guardado}`, pero `contenido` y `planes` solo del default salvo que vengan completos). Actualizar los usos de `limite` y `limites` en el resto del código para que compile (`grep -rn "limites\b\|limite(" lib app`).
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: las pruebas nuevas pasan; las que fallen solo por el cambio diario→mensual se ajustan en las Tasks 2–4.
- [ ] **Step 5: Commit** `git commit -m "Reglas de límites mensuales y paquetes"`

### Task 2: Almacén — reservar del mes y del saldo en una transacción

**Files:**
- Modify: `lib/account-store.ts`, `lib/account-store-memory.ts`, `lib/colecciones.ts`
- Test: `lib/account-store.test.ts` (versión en memoria), `lib/colecciones.test.ts`

**Interfaces:**
- Consumes: `repartirReserva`, `sumarSaldo`, `Saldo`, `PaqueteId` (Task 1).
- Produces (en `AccountStore`):
  - `type Reserva = { delMes: number; delSaldo: number }`
  - `reservarUso(negocioId: string, mes: string, c: Contador, unidades: number, tope: number): Promise<Reserva | null>` — lee el doc `uso/{negocioId}_{mes}` **y** el negocio en la misma transacción; suma `delMes` al contador y resta `delSaldo` de `negocio.paquetes[c]`.
  - `devolverUso(negocioId: string, mes: string, c: Contador, r: Reserva): Promise<void>` — regresa cada parte a su lugar (contador nunca < 0).
  - `getUso(negocioId, mes)` sin cambio de firma (ahora recibe el mes).
  - `type MovimientoPaquete = { id: string; negocioId: string; tipo: "agregar" | "quitar"; paquete?: PaqueteId; cantidades: Saldo; metodo?: PagoManual["metodo"]; nota?: string; registradoPor: string; fecha: number }`
  - `registrarMovimiento(m: MovimientoPaquete): Promise<void>`, `listarMovimientos(negocioId: string): Promise<MovimientoPaquete[]>` (más reciente primero).
  - `colecciones().movimientosPaquetes` = `${p}paquetes_movimientos`.

- [ ] **Step 1: Write the failing tests** (store en memoria):
  - `reservarUso` con tope 2 y saldo 1: tres reservas de 1 → `{1,0}`, `{1,0}`, `{0,1}`; la cuarta → `null`; `getNegocio().paquetes` queda `{}`.
  - Dos `reservarUso` en paralelo (`Promise.all`) con tope 1 y saldo 0 → exactamente una no es `null`.
  - `devolverUso` con `{delMes:1, delSaldo:2}` deja el contador en lo anterior y el saldo +2.
  - `listarMovimientos` devuelve solo los del negocio, del más nuevo al más viejo.
  - `colecciones()` con prefijo `prueba_studio_` incluye `prueba_studio_paquetes_movimientos`.
- [ ] **Step 2: Run `npm test`, verify they fail.**
- [ ] **Step 3: Implement** en memoria (dentro de `enCola`) y en Firestore (`runTransaction` con `t.get` de los dos documentos antes de escribir; `t.set(usoRef, {[c]: usado+delMes}, {merge:true})` y `t.update(negocioRef, {paquetes: sumarSaldo(...)})` solo si `delSaldo > 0`).
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Almacén: reserva mensual con saldo de paquetes"`

### Task 3: Guardián `requireAccess` con el mes y el saldo

**Files:**
- Modify: `lib/account.ts`
- Test: `lib/account.test.ts`

**Interfaces:**
- Consumes: `mesChicago`, `limiteMes`, `inicioMesSiguienteChicago` (Task 1); `reservarUso`/`devolverUso` con `Reserva` (Task 2).
- Produces: misma firma pública de `requireAccess` y de `devolver()`; mensaje de tope nuevo:
  - prueba: igual que hoy («Llegaste al límite de la prueba. Elige un plan para seguir creando.»)
  - plan: `Se acabó lo incluido este mes (${tope} ${NOMBRE_CONTADOR[c]}). Compra un paquete o espera al ${fecha}.` donde `fecha` = «1 de diciembre» (día y mes en español, hora de Chicago, del `inicioMesSiguienteChicago`).

- [ ] **Step 1: Write the failing tests:**
  - Pro con 250 voces usadas este mes y saldo `{voces: 1}` → la reserva pasa con `delSaldo 1`; la siguiente → 429 `LIMITE` con el texto «Se acabó lo incluido este mes (250 voces). Compra un paquete o espera al 1 de diciembre.» (`now` = 8 nov 2026).
  - Uso del mes anterior (doc `_2026-10` lleno) no cuenta en noviembre.
  - Básico con saldo `{voces: 50}` pidiendo `voz` → 403 `PLAN` (la herramienta no está en el plan; el saldo no se toca).
  - Clave propia: no reserva ni toca saldo.
  - `devolver()` dos veces regresa una sola vez, a mes y saldo.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** cambiando `diaChicago`→`mesChicago`, `limite`→`limiteMes` y guardando la `Reserva` para `devolver()`.
- [ ] **Step 4: Run `npm test` + `tsc`.** Ajustar las pruebas viejas de «límite de hoy» al texto nuevo. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Guardián: límites del mes y saldo de paquetes"`

### Task 4: API de cuenta y de administrador

**Files:**
- Modify: `lib/account-api.ts`, `lib/admin-api.ts`, `app/api/admin/negocios/[id]/route.ts`
- Test: `lib/account-api.test.ts`, `lib/admin-api.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `EstadoCuenta` (con negocio) gana `saldo: Saldo`, `reinicio: number` (ms), `paquetes: { id: PaqueteId; monto: number; contenido: Saldo }[]` (solo los que el plan efectivo puede comprar). `uso` y `limites` pasan a ser **del mes**.
  - `FilaNegocio.usoHoy` se renombra a `usoMes`; `FilaNegocio` gana `saldo: Saldo`.
  - `obtenerNegocio` devuelve también `movimientos: MovimientoPaquete[]`.
  - `agregarPaquete(adminEmail, emailVerified, negocioId, d: { paquete: PaqueteId; metodo: PagoManual["metodo"]; nota?: string }, deps?)` → `{ ok: true } | Falla`.
  - `quitarSaldo(adminEmail, emailVerified, negocioId, d: { cantidades: Saldo; nota?: string }, deps?)` → `{ ok: true } | Falla`.
  - Ruta POST acepta `{ accion: "paquete", paquete, metodo, nota? }` y `{ accion: "quitar_saldo", cantidades, nota? }`.

- [ ] **Step 1: Write the failing tests:**
  - `obtenerCuenta` de un Pro el 8 nov: `limites.voces === 250`, `reinicio === Date.parse("2026-12-01T06:00:00Z")`, `paquetes.map(p=>p.id)` = `["creativo","voz"]`; de un Básico = `["creativo"]`.
  - `agregarPaquete("voz")` suma `{voces:100, subtitulos:100}` al saldo y registra un movimiento `tipo:"agregar"`; con método no válido → 400; sin ser admin → 403.
  - `quitarSaldo({voces: 500})` con saldo 100 → saldo `{}` y movimiento `tipo:"quitar"` con `cantidades {voces:100}` (lo que de verdad se quitó). Cantidades negativas o no numéricas → 400.
  - `listar` devuelve `usoMes` del mes actual y `saldo`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** El cambio de saldo usa `store.modificarNegocio` (transacción) y después `registrarMovimiento`. Cantidades: enteros ≥ 0 por contador conocido.
- [ ] **Step 4: Run `npm test` + `tsc`.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "API: uso del mes, saldo y paquetes a mano"`

### Task 5: Stripe — acreditar paquetes en el webhook

**Files:**
- Modify: `lib/stripe-events.ts`
- Test: `lib/stripe-events.test.ts`

**Interfaces:**
- Consumes: `PaqueteId`, `sumarSaldo`, `PlanesConfig.paquetes` (Task 1).
- Produces:
  - `EVENTOS_STRIPE` incluye `"checkout.session.async_payment_succeeded"` (7 en total).
  - `LOOKUP_PAQUETES: Record<PaqueteId, string>` = `{ creativo: "studio_paquete_creativo", voz: "studio_paquete_voz" }`.
  - `aplicarEvento` devuelve `{ paquetes: Saldo }` para una sesión `mode: "payment"` con `metadata.paquete` válido y `metadata.negocioId === negocio.id`, cuando: (`checkout.session.completed` y `payment_status === "paid"`) o `checkout.session.async_payment_succeeded`; y `amount_total === cfg.paquetes[p].monto * 100` y `currency === "usd"`. En cualquier otro caso de pago único: `null` (con `console.warn` si el monto o el paquete no cuadran).

- [ ] **Step 1: Write the failing tests:**
  - `completed` + `paid` + creativo $5 → `paquetes {textos:500, imagenes:150}` sumado al saldo existente.
  - `completed` + `unpaid` → `null`; luego `async_payment_succeeded` de la misma sesión → acredita.
  - Monto 100 centavos para creativo → `null`. `metadata.paquete: "gratis"` → `null`. `metadata.negocioId` de otro negocio → `null`.
  - Una sesión `mode: "subscription"` sigue dando el mismo resultado que antes (copiar una de las pruebas existentes como regresión).
  - En `procesarWebhook` (con store en memoria): el mismo evento entregado dos veces suma una sola vez.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** una rama `pagoDePaquete(ses, negocio, cfg)` llamada desde los dos casos. `referenciasDeEvento` ya lee `metadata.negocioId`; confirmar que cubre el evento nuevo.
- [ ] **Step 4: Run `npm test` + `tsc`.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Webhook: acreditar paquetes pagados"`

### Task 6: Stripe — comprar paquete y «Preparar Stripe»

**Files:**
- Modify: `lib/stripe-api.ts`
- Create: `app/api/stripe/paquete/route.ts`
- Test: `lib/stripe-api.test.ts` (crear si no existe; usar el `ClienteStripe` falso como en las pruebas actuales de `pagarPlan`)

**Interfaces:**
- Consumes: Tasks 1, 5 (`LOOKUP_PAQUETES`).
- Produces:
  - `comprarPaquete(uid: string, email: string, paquete: unknown, origin: string, deps?: DepsStripe): Promise<{ ok: true; url: string } | Falla>`.
  - `prepararStripe` también crea/encuentra los precios de pago único (sin `recurring`) de los dos paquetes y guarda `paquetes.{id}.stripePriceId` con `guardarConfig`. El mensaje de éxito agrega `· Creativo: price_… · Voz: price_…`.
  - Ruta `POST /api/stripe/paquete` con `{ paquete }` → `{ url }` (misma forma que `app/api/stripe/checkout/route.ts`).

- [ ] **Step 1: Write the failing tests:**
  - Dueño Pro activo compra `voz` → `checkout.sessions.create` recibe `mode: "payment"`, `line_items [{price: <id voz>, quantity: 1}]`, `metadata { negocioId, paquete: "voz" }`, `success_url` `${origin}/?paquete=ok`, `cancel_url` `${origin}/?paquete=cancelado`, `customer` si existe o `customer_email`; sin `payment_method_types`.
  - Básico compra `voz` → 400 «El paquete Voz es del plan Pro.»
  - Cuenta pausada, en prueba o sin plan → 400 «Necesitas un plan activo para comprar paquetes.»
  - Miembro (no dueño) → 403, mismo texto que `pagarPlan` para no dueños.
  - Paquete desconocido → 400 «Elige un paquete.»
  - Sin `stripePriceId` del paquete → 503 (`NO_CONFIGURADO`).
  - `prepararStripe` dos veces no crea precios repetidos.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** reutilizando `negocioDelDueno`, `vistaDelModo`, `clienteDe` y el patrón de lookup_key de `prepararStripe`.
- [ ] **Step 4: Run `npm test` + `tsc`.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Stripe: comprar paquetes y crearlos en Preparar Stripe"`

### Task 7: Pantallas del cliente y del administrador

**Files:**
- Modify: `app/account-screens.tsx`, `app/account-gate.tsx`, `app/trial-banner.tsx`, `app/account-context.tsx` (tipos), `app/admin/page.tsx`, `app/globals.css`
- Create: `lib/aviso-uso.ts` (puro) + `lib/aviso-uso.test.ts`

**Interfaces:**
- Consumes: `EstadoCuenta` con `saldo`, `reinicio`, `paquetes` (Task 4); `POST /api/stripe/paquete` (Task 6); acciones de admin (Task 4).
- Produces: `contadoresEnAviso(uso: Uso, limites: Record<Contador, number>): Contador[]` — los que pasan del 80% (tope > 0).

- [ ] **Step 1: Write the failing test** `contadoresEnAviso({textos: 800, imagenes: 10, voces:0, subtitulos:0}, {textos:1000, imagenes:300, voces:0, subtitulos:0})` → `["textos"]`; con 799 → `[]`.
- [ ] **Step 2: Run, verify fail; implement; run, verify pass.**
- [ ] **Step 3: Mi cuenta:** por contador «Te quedan X de Y este mes» con la barra actual; si `saldo[c] > 0`, «+N de paquete»; debajo «Se reinicia el 1 de diciembre» (de `reinicio`); sección «Paquetes extra» (solo dueño) con un botón por paquete de `cuenta.paquetes`: «Creativo · +500 textos y +150 imágenes · $5» / «Voz · +100 voces y +100 subtítulos · $9». El botón hace `POST /api/stripe/paquete` y redirige a la `url`; error → mensaje de la API.
- [ ] **Step 4: Avisos:** banner suave al pasar el 80% (`contadoresEnAviso`), una vez por contador y mes (localStorage `its-aviso-80-<mes>-<contador>`, con try/catch), con botón «Ver paquetes» que abre Mi cuenta. Al recibir `LIMITE` (que no sea de prueba) el mensaje de la API se muestra con el mismo botón. Al volver con `?paquete=ok`: «¡Listo! Tu paquete se agregará en unos segundos.» y refrescar la cuenta.
- [ ] **Step 5: Panel:** columna «Uso del mes» (de `usoMes`) y «Paquetes» (saldo, «—» si vacío). En cada fila, botones «Agregar paquete» (paquete + método + nota) y «Quitar saldo» (cantidad por contador + nota). El Historial muestra los movimientos junto a los pagos a mano.
- [ ] **Step 6: Verify** `npx tsc --noEmit`, `npm test`, `npm run build`. Revisar en el navegador local (`npm run dev` con `STUDIO_CUENTAS=on` y store en memoria si existe el modo; si no, solo build) a 375 px de ancho.
- [ ] **Step 7: Commit** `git commit -m "Pantallas: uso del mes, paquetes y panel"`

### Task 8: Documentación

**Files:**
- Modify: `README.md` (sección «Cuentas y planes de pago»), `docs/superpowers/specs/2026-11-08-limites-mensuales-y-paquetes-design.md` (solo si algo cambió al programar)

- [ ] **Step 1:** Tabla de límites mensuales, tabla de paquetes, el evento nuevo (7 eventos en total) en la lista del webhook, «Preparar Stripe» crea también los paquetes, prueba con tarjeta 4242 para comprar un paquete, y en «Lanzamiento»: activar Workers Paid de Cloudflare con alerta de gasto el día del lanzamiento.
- [ ] **Step 2: Commit** `git commit -m "README: límites mensuales y paquetes"`
