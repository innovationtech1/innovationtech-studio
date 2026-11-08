# Límites mensuales y paquetes extra («Todo incluido»)

Fecha: 8 de noviembre de 2026 · Aprobado en conversación por Hector (dueño de InnovationTECH).

## Qué se quiere lograr

- El cliente paga su plan y usa Studio **sin configurar nada técnico**: toda la IA corre en la cuenta de Cloudflare de InnovationTECH (plan Workers Paid, que se activa el día del lanzamiento).
- Los límites pasan de **diarios a mensuales**: un negocio puede hacer mucho un día y nada otro sin quedarse bloqueado.
- Cuando se acaba lo incluido, el cliente compra un **paquete extra** con un clic. El que más usa deja más ganancia.
- El costo de IA de InnovationTECH siempre tiene tope. Las cantidades y los precios se cambian sin tocar el código (configuración en Firestore).

Fuera de alcance: cambiar los modelos de IA, la prueba gratis (sigue de 10 minutos), los precios de los planes ($19 y $39), el portal de Stripe.

## Decisiones de Hector

| Tema | Decisión |
|---|---|
| Reinicio de lo incluido | **El día 1 de cada mes**, medianoche de Chicago, igual para todos |
| Cantidades | Las «generosas» (tabla abajo) |
| Paquetes | Dos: **Creativo** y **Voz** |
| Lo que sobra de un paquete | **Se guarda hasta que se use** (no vence) |
| Clave propia de Cloudflare | Se queda como opción avanzada; con ella no se cuenta nada (igual que hoy) |

### Lo incluido al mes

| Plan | Textos | Imágenes | Voces | Subtítulos | Costo máximo de IA aprox. |
|---|---|---|---|---|---|
| Básico ($19) | 1,000 | 300 | — | — | ~$2.70 |
| Pro ($39) | 3,000 | 1,000 | 250 | 250 | ~$13 |
| Prueba (10 min) | 10 | 3 | 2 | 2 | igual que hoy |

### Paquetes extra (pago único)

| Paquete | Contenido | Precio | Quién lo compra | Costo de IA aprox. |
|---|---|---|---|---|
| Creativo | +500 textos, +150 imágenes | $5 | Básico y Pro | ~$1.35 |
| Voz | +100 voces, +100 subtítulos | $9 | Solo Pro | ~$1.85 |

Costos estimados con los precios publicados de Workers AI (Llama 3.3 70B ~230 neuronas por texto, Flux Schnell ~60 por imagen, Aura 2 ~1,600 por voz de un minuto, Whisper ~95 por subtítulo; $0.011 por 1,000 neuronas).

## Reglas

1. **Periodo**: `mesChicago(ahora)` devuelve `AAAA-MM` en la hora de Chicago (mismo método de `formatToParts` que `diaChicago`). El contador del negocio en ese mes es el documento `studio_uso/{negocioId}_{AAAA-MM}`.
2. **Orden de gasto**: primero lo incluido del mes; cuando se acaba, el saldo de paquetes. Si una petición pide varias unidades y solo quedan algunas del plan, el resto sale del paquete.
3. **Saldo de paquetes**: campo `paquetes` del negocio, `{ textos, imagenes, voces, subtitulos }` (enteros, nunca negativos). No vence.
4. **Atómico**: reservar del mes y del saldo pasa en **una sola transacción** de Firestore. Dos pestañas a la vez no pueden gastar de más.
5. **Devolver**: si la IA falla, se regresa exactamente lo reservado y a donde salió (mes o saldo), una sola vez.
6. **Herramientas por plan**: no cambian. El saldo de Voz no sirve en Básico (si un Pro baja a Básico, el saldo se guarda pero no se puede usar hasta volver a Pro).
7. **Cuenta en pausa o sin plan**: no se puede usar nada; el saldo se guarda.
8. **Prueba gratis**: usa el contador del mes con los topes de la prueba. Lo que use en la prueba cuenta en ese mes (son 10 textos como máximo: se acepta).
9. **Clave propia de Cloudflare**: no se cuenta ni se gasta saldo (igual que hoy).
10. **Configuración**: los topes viven en una clave **nueva**, `limitesMes`, para que ningún valor diario guardado antes se lea como mensual. `limites` (diario) deja de usarse. Los paquetes viven en `paquetes: { creativo, voz }` con `monto`, `contenido`, `planes` y `stripePriceId`.

## Compra de paquetes con Stripe

- Botón **«Comprar paquete»** en Mi cuenta (solo el dueño). Abre Stripe Checkout en modo `payment` (pago único), con `metadata: { negocioId, paquete }` y los precios con lookup_key `studio_paquete_creativo` y `studio_paquete_voz`.
- El servidor rechaza el paquete Voz si el negocio no es Pro, y cualquier paquete si la cuenta no está activa.
- **Se acredita** en el webhook que ya existe:
  - `checkout.session.completed` con `mode = "payment"` y `payment_status = "paid"` (tarjeta, Cash App Pay);
  - `checkout.session.async_payment_succeeded` (pagos con banco, que tardan días). **Evento nuevo: hay que encenderlo en el destino de Stripe** (serán 7).
  - Los dos casos son excluyentes por sesión; además la marca de «ya procesado» por evento evita sumar dos veces.
- Se valida que el monto pagado y el modo (`livemode`) coincidan con lo esperado; si no, no se acredita y se registra el error.
- **«Preparar Stripe»** también crea los dos precios de paquete (mismo método: buscar por lookup_key y crear lo que falte).
- Reembolsos: si Hector devuelve un pago, quita el saldo a mano desde el panel (ver abajo). No se automatiza.

## Pantallas

**Mi cuenta (cliente)**
- Por cada contador: «Te quedan 180 de 250 este mes» con barra, y «+60 de paquete» si tiene saldo.
- «Se reinicia el 1 de diciembre».
- Botón «Comprar paquete» con los dos paquetes (Voz solo aparece en Pro).

**Avisos**
- Al pasar el **80%** de lo incluido en algún contador: aviso suave con el botón de comprar paquete (una vez por contador y mes en ese navegador).
- Al llegar al tope y sin saldo: «Se acabó lo incluido este mes (X). Compra un paquete o espera al día 1.» con el botón. Código de error `LIMITE` (igual que hoy).

**Panel de administrador**
- La columna «Uso de hoy» pasa a **«Uso del mes»** y se agrega **«Paquetes»** (saldo).
- Botón **«Agregar paquete»**: elige Creativo o Voz, método (efectivo, Zelle, Cash App, otro), nota opcional. Suma el saldo y queda en el **Historial**.
- Botón **«Quitar saldo»** para reembolsos o errores: resta del saldo (nunca por debajo de 0) y queda en el Historial.

## Componentes (archivos)

- `lib/plans.ts`: `mesChicago`, `limitesMes`, `paquetes` en la configuración; funciones puras `repartirReserva(usadoMes, tope, saldo, unidades)` → `{ delMes, delSaldo } | null`.
- `lib/account-store.ts` y `-memory.ts`: `reservarUso` y `devolverUso` pasan a trabajar con el mes y el saldo en una transacción; `sumarPaquete` / `quitarSaldo`; registro de movimientos de paquetes en el historial.
- `lib/account.ts`: `requireAccess` usa el mes, el reparto y el nuevo mensaje; `devolver()` regresa a mes y saldo.
- `lib/account-api.ts`: Mi cuenta devuelve uso del mes, topes, saldo y la fecha de reinicio.
- `lib/stripe-api.ts`: checkout de paquete; «Preparar Stripe» crea los precios de paquete.
- `lib/stripe-events.ts`: acreditar paquetes (dos eventos) y agregar el evento nuevo a `EVENTOS_STRIPE`.
- `lib/admin-api.ts` y `app/api/admin/...`: agregar paquete, quitar saldo, uso del mes.
- `app/api/stripe/paquete/route.ts` (nuevo).
- `app/account-screens.tsx`, `app/account-gate.tsx`, `app/trial-banner.tsx`: barras, aviso del 80%, tope, compra.
- `app/admin/page.tsx`: columnas y botones.
- README: tabla de límites, paquetes, evento nuevo del webhook, pruebas con tarjetas.

## Errores

- Stripe caído al comprar: mensaje amable «No se pudo abrir el pago, intenta de nuevo».
- Aviso de paquete para un negocio que no existe o de otro modo (prueba/real): se ignora y se registra.
- Si la reserva falla por Firestore: la petición de IA no se hace y se muestra el error de siempre.

## Pruebas automáticas

- `mesChicago` en el cambio de mes (31 de octubre 23:59 y 1 de noviembre 00:00 de Chicago, y horario de verano).
- `repartirReserva`: todo del mes, mitad y mitad, todo del saldo, sin nada (rechaza), unidades raras.
- Transacción: dos reservas a la vez no pasan del tope; devolver regresa a mes y saldo una sola vez.
- Paquete Voz rechazado en Básico; paquete rechazado en cuenta pausada.
- Webhook: acredita con `paid`, no con `unpaid`; acredita en `async_payment_succeeded`; aviso repetido no suma dos veces; monto o modo distintos no acreditan.
- Admin: agregar paquete y quitar saldo (sin bajar de 0) con historial.
- Las pruebas que ya existen siguen pasando (ajustadas de día a mes).

## Para el lanzamiento (lado de Hector)

- Activar Workers Paid en Cloudflare y una alerta de gasto, el día del lanzamiento (no antes).
- Encender `checkout.session.async_payment_succeeded` en los destinos de webhook (prueba y real).
- Presionar «Preparar Stripe» otra vez (crea los paquetes).
