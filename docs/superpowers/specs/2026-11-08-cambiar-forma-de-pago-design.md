# Cambiar de forma de pago sin pagar doble ni perder días

Fecha: 8 de noviembre de 2026 · Diseño aprobado en conversación por Hector («la opción más accesible, con mejor funcionalidad y sin afectar lo que ya funciona»).

## Qué se quiere lograr

Un cliente puede pasar de **efectivo a tarjeta** o de **tarjeta a efectivo** en cualquier momento:
- nunca paga dos veces el mismo periodo;
- no pierde los días que ya pagó;
- la cuenta no se pausa en el cambio;
- todo lo que ya funciona (pago con tarjeta, pago a mano, portal, paquetes, pausas) sigue igual.

## A) De efectivo a tarjeta — lo hace el cliente

- En **Mi cuenta**, si el negocio paga a mano y su pago vence en **48 horas o más**, aparece el botón **«Pasar a tarjeta»** (solo el dueño).
- Abre Stripe Checkout de suscripción con el **mismo plan** que tiene a mano y `subscription_data.trial_end` = fin del pago a mano (Stripe exige que sea al menos 48 h en el futuro). Checkout muestra que hoy no se cobra; el primer cobro es ese día.
- Antes de abrir Stripe, la app confirma: «Vas a pasar a pago con tarjeta. Hoy no se te cobra nada: tu primer cobro de ${precio} será el ${fecha}, cuando termina lo que pagaste a mano. ¿Continuar?».
- Con eso el webhook que ya existe adopta la suscripción en estado `trialing` (cuenta como al día): el negocio pasa a `origen: "stripe"` con su plan y sigue activo. No hace falta lógica nueva en el webhook.
- Si faltan menos de 48 h, el botón no aparece y el mensaje dice: «Tu plan está pagado a mano hasta el ${fecha}. Ese día podrás poner tu tarjeta.»
- Cambiar de plan al mismo tiempo no se permite en este paso (evita pasar a Pro gratis hasta la fecha): si el dueño elige otro plan con pago a mano vigente, el mensaje sigue siendo el de hoy («Escríbenos si quieres cambiar de plan…»).

## B) De tarjeta a efectivo — lo hace Hector desde el panel

- En la fila del negocio, botón **«Pasar a pago a mano»** (solo si tiene suscripción con tarjeta al día, `active`, del modo actual).
- Formulario: plan (Básico/Pro), fecha «pagado hasta», monto, método (efectivo, Zelle, Cash App, otro), nota. La fecha debe ser **posterior al fin del mes ya pagado con tarjeta** (se muestra ese día como ayuda).
- Al guardar:
  1. Se le dice a Stripe que **cancele al final del periodo** (`cancel_at_period_end: true`): no vuelve a cobrar, el mes pagado se respeta, sin reembolsos.
  2. Se registra el pago a mano (queda en el Historial) y se guarda en el negocio como **pago a mano siguiente**: `manualSiguiente: { plan, hasta }`.
  3. El negocio sigue en `origen: "stripe"` y activo hasta el fin del mes de tarjeta.
- Cuando Stripe avisa `customer.subscription.deleted` de esa suscripción y hay `manualSiguiente` con `hasta` en el futuro: el negocio pasa a `origen: "manual"`, `plan`, `pagadoHasta = hasta`, `estado: "activo"`, y se borra `manualSiguiente`. Sin eso, el comportamiento de hoy (pausa) no cambia.
- Si antes de esa fecha la suscripción vuelve a renovar (por ejemplo, el cliente la reactiva en el portal: `cancel_at_period_end` vuelve a `false`), se registra un aviso de error en los registros y en el panel aparece «Revisar: esta suscripción volvió a renovar con un pago a mano pendiente». No se cobra doble automáticamente porque Hector lo ve y decide.
- Mientras haya `manualSiguiente`, la fila muestra «Pasa a pago a mano el ${fin del mes de tarjeta} (hasta ${hasta})».

## Lo que no cambia

- `pagarPlan` sigue bloqueando pagar con tarjeta encima de un pago a mano vigente, salvo el camino A.
- `activarManual` sigue rechazando activar a mano encima de una suscripción que cobra; el camino B es la única forma, y lo hace cancelar al final del periodo.
- Cancelar desde el portal sigue pausando de inmediato (como hoy).
- Paquetes, límites del mes, equipo: sin cambios.

## Detalles técnicos

- API de Stripe 2026-10-28: el fin del periodo está en `subscription.items.data[0].current_period_end` (segundos).
- `stripe-api.ts`: `pagarPlan` acepta el caso A (mismo plan, pago a mano vigente ≥ 48 h) y crea Checkout con `trial_end`; nueva función `pasarAManual(adminEmail, emailVerified, negocioId, datos, deps)` en `admin-api.ts` (o `stripe-api.ts` si necesita el cliente de Stripe) que llama `subscriptions.update(id, { cancel_at_period_end: true })`, registra el pago y guarda `manualSiguiente` en una transacción (`modificarNegocio`).
- `stripe-events.ts`: rama nueva en `customer.subscription.deleted` para `manualSiguiente`; aviso cuando un `updated` trae `cancel_at_period_end: false` con `manualSiguiente`.
- `plans.ts`: `Negocio.manualSiguiente?: { plan: "basico" | "pro"; hasta: number }`.
- Mi cuenta recibe `puedePasarATarjeta: { fecha: number; precio: number } | null` desde `/api/cuenta`.
- Textos nuevos con su traducción en `lib/locales/en.ts`.

## Pruebas automáticas

- A: Checkout con `trial_end` = `pagadoHasta` en segundos y mismo plan; rechazo con < 48 h; rechazo con otro plan; el webhook con `trialing` deja el negocio activo con origen stripe (regresión de lo que ya existe).
- B: `cancel_at_period_end` enviado; fecha anterior al fin del periodo → 400; sin suscripción al día → 400; `deleted` con `manualSiguiente` vigente → manual activo; `deleted` sin él → pausa (como hoy); `manualSiguiente` vencido → pausa; `updated` con `cancel_at_period_end: false` → aviso.
- Todo lo que ya existe sigue pasando.

## Cómo lo prueba Hector

- A: con la cuenta 053 (pagada a mano hasta el 8 dic): «Pasar a tarjeta» → tarjeta 4242 → en Stripe la suscripción aparece «En periodo de prueba hasta el 8 dic» y en el panel el 053 sale con origen Tarjeta y activo.
- B: con una cuenta que paga con tarjeta: «Pasar a pago a mano» → en Stripe la suscripción dice «Se cancela el …» y en el panel aparece «Pasa a pago a mano el …». El paso final (cuando llega el fin de mes) se comprueba con las pruebas automáticas, o con un reloj de prueba de Stripe si hace falta.
