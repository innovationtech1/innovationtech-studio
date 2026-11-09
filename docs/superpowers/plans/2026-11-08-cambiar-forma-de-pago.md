# Cambiar de forma de pago · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar de efectivo a tarjeta (el cliente, con primer cobro al vencer lo pagado a mano) y de tarjeta a efectivo (el admin, cancelando al final del periodo) sin pagar doble ni pausar la cuenta.

**Architecture:** A reutiliza `pagarPlan` + Checkout con `subscription_data.trial_end`; el webhook existente ya adopta una suscripción `trialing` como al día. B agrega `pasarAManual` (cancela al final del periodo, registra el pago y guarda `manualSiguiente`) y una rama en el aviso `customer.subscription.deleted` que activa el pago a mano.

**Tech Stack:** Next.js 15, TypeScript, firebase-admin, stripe@23.1.0 (API 2026-10-28.endive), node:test (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-08-cambiar-forma-de-pago-design.md`

## Global Constraints

- Ventana mínima para A: el pago a mano vence en **≥ 48 horas** (`pagadoHasta - ahora >= 48*3600*1000`). `trial_end` = `Math.floor(pagadoHasta / 1000)`.
- A solo con el **mismo plan** que el pago a mano; solo el dueño.
- B solo con suscripción `active` del modo actual; la fecha «hasta» debe ser **posterior** a `items.data[0].current_period_end * 1000`.
- `Negocio.manualSiguiente?: { plan: "basico" | "pro"; hasta: number }` (ms).
- Copias exactas (es):
  - Confirmación A: «Vas a pasar a pago con tarjeta. Hoy no se te cobra nada: tu primer cobro de ${precio} será el ${fecha}, cuando termina lo que pagaste a mano. ¿Continuar?» — botones «Sí, pasar a tarjeta» / «Cancelar». `${precio}` como «$19», `${fecha}` como «8 de diciembre» (es-MX, America/Chicago).
  - Menos de 48 h: «Tu plan está pagado a mano hasta el ${fecha}. Ese día podrás poner tu tarjeta.»
  - Otro plan con pago a mano vigente: «Tu plan está pagado a mano hasta ${fechaLarga}. Para cambiar de plan, escríbenos.»
  - Panel B, nota en la fila: «Pasa a pago a mano el ${finTarjeta} (hasta ${hasta})».
  - Panel aviso: «Revisar: esta suscripción volvió a renovar con un pago a mano pendiente».
- Textos nuevos de la interfaz con su entrada en `lib/locales/en.ts`. Sin dependencias nuevas. `npm test` → `# fail 0`; `npx tsc --noEmit` limpio; `npm run build` compila.

## Review Focus

1. **Doble cobro en B si el cliente reactiva en el portal** (`cancel_at_period_end` vuelve a `false`): debe quedar marcado `stripe.renovoConManual: true` y verse «Revisar…» en el panel. → prueba en Task 2.
2. **Aviso `deleted` de una suscripción vieja o de otra** con `manualSiguiente`: solo aplica si es la suscripción actual del negocio. → prueba en Task 2.
3. **`manualSiguiente` ya vencido** cuando llega `deleted`: pausa como hoy y se borra `manualSiguiente`. → prueba en Task 2.
4. **Pasar a tarjeta dos veces** (doble pestaña): la protección de `checkoutPendiente` de `pagarPlan` debe seguir aplicando. → prueba en Task 1.
5. **Cuenta con pago a mano y suscripción `trialing` de otro modo de Stripe** (prueba ↔ real): no se toma como al día (ya cubierto por `estadoEfectivo`); A no debe ofrecer el botón si `stripeModoLive` no coincide con un `customerId` guardado del otro modo (usar `vistaDelModo`). → prueba en Task 1.

---

### Task 1: De efectivo a tarjeta (servidor)

**Files:**
- Modify: `lib/stripe-api.ts` (`pagarPlan`, `crearCheckout`), `lib/account-api.ts` (`obtenerCuenta`)
- Test: `lib/stripe-events.test.ts` (donde viven las pruebas de `pagarPlan` y el Stripe falso), `lib/account-api.test.ts`

**Interfaces:**
- Produces:
  - `crearCheckout(cliente, negocio, email, priceId, origin, opciones?: { trialEnd?: number })` — con `trialEnd` agrega `subscription_data.trial_end` (segundos) manteniendo `metadata`.
  - `pasarATarjetaDisponible(negocio: Negocio, ahora: number): boolean` en `lib/plans.ts` (pura): `origen === "manual"`, `estado !== "pausado"`, `pagadoHasta - ahora >= 48 h`.
  - `EstadoCuenta` gana `pasarATarjeta: { fecha: number; precio: number } | null` (solo dueño; `precio` = `cfg.precios[plan].monto`; `fecha` = `pagadoHasta`).
  - `pagarPlan` con pago a mano vigente: mismo plan y ≥ 48 h → Checkout con `trialEnd`; mismo plan y < 48 h → 400 con la copia «Ese día podrás poner tu tarjeta.»; otro plan → 400 «Para cambiar de plan, escríbenos.».

- [ ] **Step 1: Tests** (fallan primero):
  - `pasarATarjetaDisponible`: manual hasta now+49h → true; now+47h → false; origen stripe → false; pausado → false.
  - `pagarPlan` 053-like (manual Básico hasta now+30 días) eligiendo `basico` → `checkout.sessions.create` recibe `mode: "subscription"`, `subscription_data.trial_end === Math.floor(pagadoHasta/1000)`, `subscription_data.metadata.negocioId`.
  - Mismo caso con `pro` → 400, texto «Para cambiar de plan, escríbenos.», Stripe no llamado.
  - Manual hasta now+24h con `basico` → 400 con «Ese día podrás poner tu tarjeta.», Stripe no llamado.
  - Dos llamadas seguidas (A) → la segunda reutiliza/vence la sesión pendiente como hoy (no dos suscripciones).
  - Webhook regresión: `customer.subscription.created` con `status: "trialing"` sobre negocio manual vigente → `origen: "stripe"`, `estado: "activo"`, plan del precio.
  - `obtenerCuenta`: dueño manual vigente ≥ 48 h → `pasarATarjeta = { fecha: pagadoHasta, precio: 19 }`; miembro → null; < 48 h → null.
- [ ] **Step 2: Run `npm test`, verify the new tests fail.**
- [ ] **Step 3: Implement.** En `pagarPlan`, reemplazar el bloqueo actual (línea con «Escríbenos si quieres pasarte a tarjeta») por las tres ramas de arriba. `fechaLarga` ya existe para la copia de otro plan; la copia de < 48 h usa día y mes («8 de diciembre»).
- [ ] **Step 4: `npm test` y `npx tsc --noEmit` pasan.**
- [ ] **Step 5: Commit** «Pagos: pasar de efectivo a tarjeta sin cobrar dos veces»

### Task 2: De tarjeta a efectivo (servidor y webhook)

**Files:**
- Modify: `lib/plans.ts` (tipo `Negocio`), `lib/stripe-api.ts` (nueva `pasarAManual`, usa `ClienteStripe.subscriptions`), `lib/stripe-events.ts` (`customer.subscription.updated|deleted`), `lib/admin-api.ts` (`FilaNegocio`), `app/api/admin/negocios/[id]/route.ts`
- Test: `lib/stripe-events.test.ts`, `lib/admin-api.test.ts`

**Interfaces:**
- Consumes: `registrarPagoManual`, `modificarNegocio`, `esCorreoAdmin`, `vistaDelModo`, `clienteDe`.
- Produces:
  - `Negocio.manualSiguiente?: { plan: "basico" | "pro"; hasta: number }`; `Negocio.stripe.renovoConManual?: boolean`.
  - `pasarAManual(adminEmail, emailVerified, negocioId, datos: DatosActivar, deps?: DepsStripe): Promise<{ ok: true; finTarjeta: number } | Falla>` en `lib/stripe-api.ts`.
  - Ruta POST admin acepta `{ accion: "pasar_a_manual", plan, fecha, monto, metodo, nota? }` (`fecha` AAAA-MM-DD → `finDelDiaChicago`).
  - `FilaNegocio` gana `finTarjeta?: number` (solo si hay `manualSiguiente`; de `stripe.finPeriodo` guardado por el webhook o por `pasarAManual`).
  - `Negocio.stripe.finPeriodo?: number` (ms) guardado en los avisos de suscripción desde `items.data[0].current_period_end`.

- [ ] **Step 1: Tests** (fallan primero):
  - `pasarAManual` con suscripción `active`: llama `subscriptions.retrieve` y `subscriptions.update(id, { cancel_at_period_end: true })`; registra el pago a mano; el negocio queda `origen: "stripe"`, `manualSiguiente: { plan, hasta }`, `stripe.finPeriodo`; devuelve `finTarjeta`.
  - `hasta` ≤ fin del periodo → 400 «La fecha debe ser después del ${fecha}, cuando termina el mes pagado con tarjeta.», Stripe update no llamado.
  - Sin suscripción `active` (manual, pausada, `past_due`) → 400 «Este negocio no tiene una suscripción con tarjeta al día.».
  - No admin → 403; error de Stripe → 502 sin cambios en Firestore.
  - Webhook `customer.subscription.deleted` (suscripción actual) con `manualSiguiente.hasta` futuro → `origen: "manual"`, `plan`, `pagadoHasta`, `estado: "activo"`, `manualSiguiente` borrado (campo `undefined`/eliminado).
  - `deleted` con `manualSiguiente` vencido → pausa como hoy, `manualSiguiente` borrado.
  - `deleted` de otra suscripción → sin cambios (como hoy).
  - `customer.subscription.updated` con `cancel_at_period_end: false` y `manualSiguiente` → `stripe.renovoConManual: true` y `console.error`; con `true` → sin marca.
  - Todas las pruebas existentes de avisos siguen pasando.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Borrar un campo en Firestore desde `aplicarEvento`: si el store no lo soporta con `undefined`, usar `FieldValue.delete()` en `modificarNegocio` para claves con valor `null` (documentar en el store y en el de memoria) o guardar `manualSiguiente: null` y tratar `null` como ausente — elegir una y probarla en ambos stores.
- [ ] **Step 4: `npm test` y `npx tsc --noEmit` pasan.**
- [ ] **Step 5: Commit** «Pagos: pasar de tarjeta a pago a mano al final del mes»

### Task 3: Pantallas, traducciones y guía

**Files:**
- Modify: `app/account-screens.tsx` (Mi cuenta / ElegirPlan), `app/admin/page.tsx`, `lib/locales/en.ts`, `README.md`
- Create (si hace falta lógica pura): `lib/confirmar-plan.ts` (agregar `confirmacionPasarATarjeta(pasarATarjeta) → { mensaje; boton } | null`) + prueba

**Interfaces:**
- Consumes: `EstadoCuenta.pasarATarjeta` (Task 1), POST `/api/stripe/checkout` `{ plan }`; admin `accion: "pasar_a_manual"`, `FilaNegocio.finTarjeta`, `negocio.manualSiguiente`, `negocio.stripe.renovoConManual` (Task 2).

- [ ] **Step 1: Test** `confirmacionPasarATarjeta({ fecha: Date.parse("2026-12-09T05:59:59Z"), precio: 19 })` → mensaje exacto de Global Constraints con «$19» y «8 de diciembre»; `null` → `null`.
- [ ] **Step 2: Mi cuenta:** si `cuenta.pasarATarjeta`, botón «Pasar a tarjeta» → diálogo de confirmación (mismo componente `Confirmar` de la confirmación de plan) → POST checkout con el plan actual → redirige a Stripe.
- [ ] **Step 3: Panel:** botón «Pasar a pago a mano» solo si `negocio.origen === "stripe"` y `negocio.stripe?.status === "active"`; formulario igual al de «Activar plan» (plan, fecha, monto, método, nota) con ayuda «El mes con tarjeta termina el ${finPeriodo}» cuando se conoce; nota de fila si `manualSiguiente`; aviso rojo si `stripe.renovoConManual`.
- [ ] **Step 4: README** (sección Cuentas y planes): cómo pasar de efectivo a tarjeta y de tarjeta a efectivo, y qué hacer si aparece «Revisar».
- [ ] **Step 5:** `npx tsc --noEmit`, `npm test`, `npm run build`. Commit «Pantallas: pasar a tarjeta y pasar a pago a mano».
