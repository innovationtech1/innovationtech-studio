# Diseño: Cuentas y planes de pago de InnovationTECH Studio

> Estado: **diseño aprobado por secciones** (7 nov 2026), pendiente de revisión final del dueño.
> Primera de cuatro partes de la nueva fase de Studio: **1. Cuentas y planes** → 2. Memoria (RAG) → 3. NOVA en Studio → 4. Panel de administrador completo.

## 1. Objetivo

Convertir Studio en un **servicio por suscripción** de InnovationTECH: cada negocio cliente inicia sesión, contrata un plan mensual (Básico o Pro) y solo ve lo suyo. El dueño de InnovationTECH (administrador) ve todos los negocios y puede activar planes pagados a mano. **Todo lo cobrado es para InnovationTECH.**

**Éxito significa:**
- Nadie puede usar Studio sin cuenta y sin plan vigente (salvo los 10 minutos de prueba).
- Las reglas de plan, herramientas y límites se cumplen en el **servidor**, no solo en la pantalla.
- Un pago con tarjeta activa el plan sin intervención; una cancelación o un pago fallido lo pausan sin intervención.
- El administrador puede activar, pausar y reactivar cuentas pagadas en efectivo, Zelle o Cash App.

## 2. Decisiones del dueño

| Tema | Decisión |
|---|---|
| Planes | **Básico $19/mes**, **Pro $39/mes**. Precios, herramientas y límites editables después (parte 4) |
| Diferencia | Mixta: Pro agrega **reels, editor de video, voz en off y subtítulos** y tiene límites mayores |
| Prueba | Al registrarse: **Pro durante 10 minutos**, con límites de prueba; después debe contratar |
| Cuenta de IA | Por defecto la de InnovationTECH con límites diarios; si el cliente conecta la suya, **sin límites** (pero igual necesita plan) |
| Uso libre | **Todos necesitan plan**; ya no hay uso anónimo ni modo demo |
| Cobro | **Stripe** (cobro automático mensual; Cash App Pay opcional dentro de Stripe) **+ manual** (efectivo, Zelle, Cash App) |
| Falta de pago o cancelación | **Pausa inmediata**, sin borrar datos; no se reembolsan días restantes |
| Inicio de sesión | **Google** y **correo con contraseña** (con «olvidé mi contraseña») |
| Equipo | Básico: 1 persona. Pro: hasta 3 personas del mismo negocio |
| Firebase | El **mismo proyecto** que NOVA (`innovationtech-nova`, plan Spark), colecciones separadas `studio_*` |
| Publicación | Netlify (plan de pago antes del primer cliente) |

### 2.1 Herramientas por plan

| Herramienta | Prueba (10 min) | Básico | Pro |
|---|:-:|:-:|:-:|
| Textos, asistente (NOVA), Mi marca, plantillas, galería | ✅ | ✅ | ✅ |
| Imágenes, editor de imágenes, quitar fondo | ✅ | ✅ | ✅ |
| Calendario de 30 días, carrusel, todos los tamaños | ✅ | ✅ | ✅ |
| Música (compuesta, biblioteca, efectos de sonido) | ✅ | ✅ | ✅ |
| Reels, editor de video | ✅ | ❌ | ✅ |
| Voz en off, subtítulos automáticos | ✅ | ❌ | ✅ |
| Video con IA (Replicate) | ❌ | ❌ | ✅ solo con clave propia del cliente |
| Personas por negocio | 1 | 1 | 3 |

### 2.2 Límites diarios con la cuenta de IA de InnovationTECH

| Contador | Prueba (10 min) | Básico | Pro |
|---|:-:|:-:|:-:|
| `textos` (mensajes al asistente y textos) | 10 | 60 | 200 |
| `imagenes` | 3 | 20 | 60 |
| `voces` | 2 | 0 | 30 |
| `subtitulos` | 2 | 0 | 30 |

- Se reinician a la **medianoche de San Antonio** (`America/Chicago`).
- El equipo de un negocio **comparte** los contadores.
- Lo que se hace con la clave propia del cliente **no se cuenta**.
- Música, editor de video, editor de imágenes y quitar fondo corren en el dispositivo: **sin límite**.

## 3. Arquitectura

```
 Navegador (Studio)                    Servidor de Studio (Netlify)                 Servicios
 ──────────────────                    ────────────────────────────                 ─────────
 Inicia sesión con   ── token ──►      Cada /api/*:                                 Firebase Auth
 Firebase Auth (SDK web)               1. Verifica el token de Firebase             (verificación con
                                       2. Lee usuario y negocio en Firestore  ─────► las llaves públicas)
 Pide un texto,                        3. Calcula el estado efectivo                 Firestore
 imagen o voz        ── pedido ──►        (prueba / activo / pausado)               (studio_*)
                                       4. ¿El plan incluye la herramienta?
                                       5. ¿Clave propia? → no cuenta
                                          ¿Cuenta de InnovationTECH? → revisa y
                                          suma el contador del día (transacción)
                                       6. Llama a Cloudflare / Anthropic / Replicate ► Proveedores de IA
 Elige plan          ── checkout ──►   Crea la sesión de pago ───────────────────► Stripe Checkout
 Página de Stripe    ◄─────────────────────────────────────────────────────────── 
                                       /api/stripe/webhook  ◄── aviso firmado ───── Stripe
                                       actualiza plan y estado en Firestore
```

- **Guardián único en el servidor:** `lib/account.ts` expone `requireAccess(req, { herramienta, contador, unidades })`. Lo llaman todas las rutas de `/api/*` antes de trabajar. La pantalla también oculta o bloquea lo que no corresponde, pero la regla de verdad es la del servidor.
- **Reemplaza al modo demo:** `getCreds` de `lib/cf-auth.ts` deja de contar por IP en memoria. Con clave propia (encabezados `x-cf-account`/`x-cf-token`) usa la del cliente; si no, usa `CF_ACCOUNT_ID`/`CF_API_TOKEN` de InnovationTECH **solo después** de que `requireAccess` aprobó y sumó el contador. `refund` devuelve el uso si el proveedor falla.
- **Verificación del token:** con las llaves públicas de Google (`securetoken@system.gserviceaccount.com`) y la biblioteca `jose`, igual que `lib/verificarToken.js` de NOVA (en Netlify no se usa `firebase-admin/auth`). Firestore sí se usa con `firebase-admin`.
- **Firestore cerrado:** las reglas siguen negando todo acceso directo desde el navegador; solo el servidor (cuenta de servicio) lee y escribe.

## 4. Datos (Firestore, proyecto `innovationtech-nova`, base `(default)`)

| Colección / documento | Campos |
|---|---|
| `studio_usuarios/{uid}` | `email`, `negocioId`, `rol` (`dueno` \| `miembro`), `creado` |
| `studio_negocios/{negocioId}` | `nombre`, `duenoUid`, `miembros` [uid], `plan` (`pro` \| `basico` \| null), `estado` (`prueba` \| `activo` \| `pausado`), `pruebaHasta`, `origen` (`stripe` \| `manual` \| null), `pagadoHasta` (manual), `stripe` {`customerId`, `subscriptionId`, `status`, `priceId`}, `creado`, `actualizado` |
| `studio_invitaciones/{email}` | `negocioId`, `invitadoPor`, `creado` |
| `studio_uso/{negocioId}_{AAAA-MM-DD}` | `textos`, `imagenes`, `voces`, `subtitulos` (se suman con `FieldValue.increment` dentro de una transacción) |
| `studio_pagos_manuales/{id}` | `negocioId`, `plan`, `monto`, `metodo` (`efectivo` \| `zelle` \| `cashapp` \| `otro`), `hasta`, `nota`, `registradoPor`, `fecha` |
| `studio_config/planes` | `precios` {`basico`: {`monto`, `stripePriceId`}, `pro`: …}, `herramientas` {`prueba`, `basico`, `pro`: [ids]}, `limites` {`prueba`, `basico`, `pro`: {contador: número}}, `personas` {`basico`: 1, `pro`: 3}, `pruebaMinutos`: 10 |

- Si `studio_config/planes` no existe, el servidor usa los valores de la sección 2 (escritos en `lib/plans.ts`).
- **Administradores:** variable `STUDIO_ADMIN_EMAILS` (correos separados por coma), no un campo en Firestore.
- Lo que hoy vive en el navegador (Mi marca, galería, claves propias) **se queda en el navegador** en esta parte; pasarlo a la nube es la parte 2 (Memoria).

### 4.1 Estado efectivo (función pura, con pruebas)

`estadoEfectivo(negocio, ahora)`:
1. `estado = pausado` → **pausado**.
2. `estado = prueba` y `ahora > pruebaHasta` → **sin plan** (pantalla «Elige tu plan»).
3. `origen = manual` y `ahora > pagadoHasta` → **pausado** (se guarda así en la siguiente escritura).
4. `origen = stripe` y `stripe.status` ∈ {`active`, `trialing`} → **activo**; cualquier otro (`past_due`, `unpaid`, `canceled`, `incomplete`…) → **pausado**.
5. En otro caso, `estado`.

`puedeUsar(plan, herramienta)` y `limite(plan, contador)` leen la configuración. Los tres son funciones puras en `lib/plans.ts`.

## 5. Flujos

### 5.1 Entrada del cliente
1. Sin sesión: pantalla de bienvenida con **«Entrar con Google»** y **«Entrar con correo»** («Crear cuenta», «Olvidé mi contraseña»). En celular, si la ventana emergente de Google se bloquea, se usa redirección.
2. Primera vez: `POST /api/cuenta` con el nombre del negocio → crea `studio_negocios` en `prueba` con `plan: pro`, `pruebaHasta = ahora + 10 min`, y `studio_usuarios`. Si su correo tiene una invitación vigente y hay cupo, se une a ese negocio como `miembro` en lugar de crear uno nuevo.
3. Durante la prueba: aviso fijo arriba con la cuenta regresiva.
4. Al vencer: pantalla **«Elige tu plan»** (Básico / Pro → Stripe) y el texto «¿Pagas en efectivo, Zelle o Cash App? Escríbenos e InnovationTECH activará tu cuenta al confirmar tu pago», con los datos de contacto.
5. **Mi cuenta:** plan, estado, uso del día por contador, botón **«Administrar suscripción»** (portal de Stripe) y, en Pro, **invitar** hasta 2 correos y quitar miembros.

### 5.2 Pantallas por estado
- **Pausado:** puede ver galería y Mi marca; no puede crear. Aviso con **«Pagar para reactivar»** (Stripe: portal para actualizar tarjeta; manual: datos de contacto).
- **Herramienta fuera del plan:** se ve con la etiqueta **«Pro»** y el botón **«Mejorar a Pro»**.
- **Límite alcanzado** (respuesta 429 con código `LIMITE`): «Llegaste al límite de hoy (20 imágenes). Se reinicia a medianoche. Puedes pasarte a Pro o conectar tu propia cuenta para usarlo sin límite.» En prueba: «Llegaste al límite de la prueba. Elige un plan para seguir creando.»

### 5.3 Stripe
- **Productos y precios:** «Studio Básico» y «Studio Pro», mensuales en USD. Un botón del panel de administrador («Preparar Stripe») los crea si no existen y guarda los `priceId` en `studio_config/planes`. Cambiar un precio crea un **precio nuevo** para clientes nuevos; los suscriptores actuales **conservan su precio**.
- **Pagar:** `POST /api/stripe/checkout` {plan} → sesión de Checkout `mode: subscription` con `client_reference_id = negocioId`, el correo del usuario y el `customer` existente si ya hay. Métodos: tarjeta y, opcional, **Cash App Pay**. Al volver: `/?pago=ok`.
- **Administrar:** `POST /api/stripe/portal` → sesión del portal de clientes (cambiar plan con prorrateo, actualizar tarjeta, recibos, cancelar). En la configuración del portal, la cancelación es **inmediata** y sin reembolso.
- **Avisos (webhook):** `POST /api/stripe/webhook`, firma verificada con `STRIPE_WEBHOOK_SECRET` sobre el cuerpo crudo. Eventos:
  - `checkout.session.completed` → guarda `customerId` y `subscriptionId` en el negocio.
  - `customer.subscription.created` / `updated` → `plan` según el `priceId`, `stripe.status`, `estado = activo` o `pausado`.
  - `customer.subscription.deleted` → `estado = pausado`.
  - `invoice.payment_failed` → `estado = pausado`.
  - `invoice.paid` → `estado = activo`.
  - Cada evento se procesa una sola vez (se guarda el id del evento) y se ignora si llega fuera de orden respecto al último `actualizado`.

### 5.4 Pagos a mano (panel mínimo del administrador)
Ruta `/admin` dentro de Studio, solo para correos en `STUDIO_ADMIN_EMAILS`:
- Lista de negocios con nombre, dueño, plan, estado, origen, fecha de vencimiento y uso de hoy, con buscador.
- **«Activar plan»:** plan, **pagado hasta** (fecha), monto, método (**efectivo, Zelle, Cash App** u otro) y nota → `origen = manual`, `estado = activo`, y se agrega a `studio_pagos_manuales`.
- **«Pausar»** y **«Reactivar»** para casos especiales (en negocios de Stripe, «Reactivar» solo funciona si la suscripción está al día).
- **«Preparar Stripe»** (ver 5.3).
- El panel completo (guías, límites editables, precios editables) es la **parte 4**.

## 6. Rutas del servidor nuevas o cambiadas

| Ruta | Qué hace |
|---|---|
| `GET /api/cuenta` | Estado efectivo, plan, herramientas, límites y uso de hoy del usuario |
| `POST /api/cuenta` | Crea el negocio (primera vez) o une al invitado |
| `POST /api/cuenta/invitar`, `DELETE /api/cuenta/miembros/{uid}` | Equipo (solo Pro, solo el dueño) |
| `POST /api/stripe/checkout`, `POST /api/stripe/portal` | Pago y portal de Stripe |
| `POST /api/stripe/webhook` | Avisos de Stripe (sin sesión; con firma) |
| `GET/POST /api/admin/negocios…` | Panel mínimo (solo administradores) |
| `/api/text`, `/api/chat`, `/api/image`, `/api/voice`, `/api/transcribe`, `/api/video*` | Llaman a `requireAccess` con su herramienta y contador |

## 7. Configuración y cuentas que hace el dueño (con guía paso a paso)

1. **Firebase:** activar el proveedor **Google** en Authentication y agregar `innovationtech-studio.netlify.app` a los dominios autorizados.
2. **Stripe:** crear la cuenta, registrar el negocio y la cuenta de banco; usar primero el **modo de prueba**; crear el webhook hacia `https://innovationtech-studio.netlify.app/api/stripe/webhook` con los eventos de 5.3; (opcional) activar Cash App Pay.
3. **Netlify (proyecto de Studio), variables de entorno:**
   - Secretas: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CF_API_TOKEN`.
   - No secretas (en `SECRETS_SCAN_OMIT_KEYS`): `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `STUDIO_ADMIN_EMAILS`, `CF_ACCOUNT_ID`, `STUDIO_CUENTAS`.
4. **Antes del primer cliente:** Netlify plan Personal ($9); revisar si hace falta el plan pagado de Cloudflare Workers; consultar a un contador sobre el impuesto de ventas de Texas (Stripe Tax se puede activar después).

**Paquetes nuevos (oficiales y gratuitos):** `firebase` (inicio de sesión en el navegador), `firebase-admin` (Firestore en el servidor), `stripe` (servidor) y `jose` (verificar tokens).

## 8. Lanzamiento sin cortar el servicio

- Todo queda detrás de la variable **`STUDIO_CUENTAS`**. Mientras no sea `on`, Studio funciona como hoy. Así se puede publicar por partes y probar en una versión de prueba de Netlify.
- Orden: (1) inicio de sesión y negocio; (2) planes, herramientas y límites en el servidor; (3) pantallas por estado; (4) panel mínimo y pagos a mano; (5) Stripe en modo de prueba; (6) encender `STUDIO_CUENTAS=on` en producción; (7) cambiar Stripe a claves reales.

## 9. Pruebas

- **Unitarias** (funciones puras de `lib/plans.ts`): estado efectivo en cada caso (prueba vigente/vencida, manual vigente/vencido, cada `stripe.status`, pausado), herramientas por plan, límites y reinicio diario en `America/Chicago`.
- **Webhook:** eventos de Stripe firmados en las pruebas (la firma se genera con el mismo secreto de prueba), incluidos duplicados y fuera de orden.
- **Guardián:** sin token → 401; pausado → 403 `PAUSADO`; herramienta fuera del plan → 403 `PLAN`; límite → 429 `LIMITE`; clave propia → no cuenta; error del proveedor → se devuelve el uso.
- **De punta a punta, en la versión de prueba de Netlify con Stripe en modo de prueba:** registrarse con Google y con correo, prueba de 10 minutos, pagar Básico con tarjeta de prueba, mejorar a Pro, invitar a un miembro, tarjeta rechazada → pausa, pagar → reactivar, cancelar → pausa, activar a mano con Cash App y que se pause al vencer.

## 10. Fuera de esta parte

- Memoria en la nube (marca, contenido creado, guías) y NOVA dentro de Studio: partes 2 y 3.
- Editar precios, herramientas y límites desde el panel: parte 4 (en esta parte quedan en `studio_config/planes` y en `lib/plans.ts`).
- Inicio de sesión único con NOVA y onRoute: después de la parte 4 (el proyecto de Firebase ya es el mismo).
- Facturas fiscales e impuestos: se decide con el contador.

## 11. Riesgos conocidos

- **Cuota gratuita de Firestore (Spark):** 50,000 lecturas y 20,000 escrituras al día. Cada pedido con IA lee ~3 documentos y escribe 1, así que alcanza para decenas de clientes activos. Si se acerca al tope, se agrega caché en memoria del negocio y la configuración.
- **Cuota de Cloudflare:** con los límites «amplios» y varios clientes, la cuota gratuita diaria de Workers AI no alcanzará; habrá que pasar al plan pagado de Workers.
- **Pausa inmediata al cancelar:** puede generar reclamos porque no se reembolsan días; el texto de la pantalla y la ficha de NOVA lo dicen claramente.
- **Inicio de sesión con Google en la app instalada del iPhone:** las ventanas emergentes pueden fallar; se usa redirección y, si aun así falla, el correo con contraseña.
