# Video híbrido · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Videos de 10 a 30 s desde fotos: animación gratis en el navegador + 1 o 2 tomas de 5 s con IA (fal.ai), con cola con prioridad, aviso por webhook, caché, cuotas, tope diario y estados de carga, también en el modo demo.

**Architecture:** Las tomas se cuentan con un contador nuevo `tomas_ia` dentro del sistema de límites del mes y paquetes que ya existe. Cada toma es un trabajo en Firestore; `despachar()` los manda a fal.ai respetando prioridad, simultáneos y tope de gasto, y se llama al crear, al recibir avisos y al consultar estado. Fotos y clips viven en Cloudflare R2 con enlaces firmados (SigV4 con `node:crypto`). El navegador arma el video final con `renderReel`.

**Tech Stack:** Next.js 15, TypeScript, firebase-admin, node:crypto (SigV4, ED25519, SHA-256), fal.ai queue REST API, Cloudflare R2 (API S3), stripe@23.1.0, node:test.

**Spec:** `docs/superpowers/specs/2026-11-10-video-hibrido-design.md`

## Global Constraints

- Contador `tomas_ia` (etiqueta «Tomas con IA»): `limitesMes` prueba 1, básico 0, pro 20.
- Paquete `video`: `{ contenido: { tomas_ia: 20 }, monto: 15, planes: ["basico","pro"] }`, lookup_key `studio_paquete_video`, producto «Studio Paquete Video».
- Herramienta `video_ia`: prueba, básico y pro (con cuentas activas). Con cuentas apagadas, `app/api/video` (Replicate) sin cambios.
- `cfg.videoIa` (editable, con valores por defecto): `modelos.demo = { id: "fal-ai/wan-25-preview/image-to-video", centavosPorSegundo: 5 }`, `modelos.estandar = { id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", centavosPorSegundo: 7 }`, `segundosToma: 5`, `topeDiarioCentavos: 500`, `umbralDemo: 0.8`, `simultaneos: 3`, `minutosAtorado: 15`, `maxIntentos: 2`.
- Modelo: prueba → `demo`; básico/pro → `estandar`. Prioridad: pro sin saldo = 1, saldo (básico o pro) = 2, prueba = 3.
- Duraciones 10, 15, 20, 30 s; 0, 1 o 2 tomas por video.
- Subidas: `image/jpeg|png|webp`, ≤ 8 MB, enlace PUT 5 min; llave `negocios/{negocioId}/fotos/{sha256}.{ext}`; clips `negocios/{negocioId}/clips/{trabajoId}.mp4`; los de prueba bajo `demo/` (para regla de borrado a 30 días en R2).
- Variables: `FAL_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `VIDEO_IA` (`off` apaga).
- Nunca registrar claves, secretos de trabajo ni enlaces firmados completos. Sin dependencias nuevas.
- Textos de la interfaz en español con entrada en `lib/locales/en.ts`. `npm test` `# fail 0`, `npx tsc --noEmit` limpio, `npm run build` compila.

## Review Focus

1. **Doble despacho**: dos `despachar()` a la vez (dos consultas de clientes) no deben enviar el mismo trabajo ni pasar de 3 simultáneos ni del tope. → prueba en Task 4.
2. **Aviso repetido o falso**: fal reenvía el mismo `request_id`; o alguien llama al webhook sin firma o con otro secreto → se procesa una vez / se rechaza sin tocar nada. → pruebas en Task 3 y Task 4.
3. **Fallo después de cobrar**: fal acepta y luego falla dos veces → la toma se devuelve a donde salió (mes o saldo) y el gasto del día baja. → prueba en Task 4.
4. **Tope del día alcanzado**: trabajos quedan `en_fila` y salen al día siguiente; la prueba (demo) se detiene al 80%. → prueba en Task 4.
5. **Caché por negocio**: pedir lo mismo dos veces no descuenta la segunda; la llave incluye el `negocioId`, así un negocio nunca recibe el clip de otro. → prueba en Task 4.

---

### Task 1: Reglas, configuración y contador `tomas_ia`

**Files:** Modify `lib/plans.ts` (+ tests), `lib/account-api.ts`, `app/account-screens.tsx`, `lib/locales/en.ts`, `lib/stripe-events.ts` (`LOOKUP_PAQUETES.video`), cualquier `Record<Contador,…>` que deje de compilar.

**Interfaces — Produces:** `Contador` incluye `"tomas_ia"`; `PaqueteId` incluye `"video"`; `PlanesConfig.videoIa: ConfigVideoIa`; `type NivelModelo = "demo" | "estandar"`; `modeloDePlan(plan: Plan): NivelModelo`; `prioridadToma(plan: Plan, usaSaldo: boolean): 1 | 2 | 3`; `costoTomaCentavos(cfg, nivel): number` (= centavosPorSegundo × segundosToma); `normalizarMovimiento(s: string): string` (minúsculas, espacios simples, recortado a 300); `herramientas` con `video_ia` en prueba/básico/pro.

- [ ] Tests: defaults exactos de Global Constraints; `mezclarConfig` mezcla `videoIa` sin perder defaults; `costoTomaCentavos(cfg,"estandar") === 35`; `modeloDePlan("prueba") === "demo"`; `prioridadToma("pro", false) === 1`, `("basico", true) === 2`, `("prueba", false) === 3`; `normalizarMovimiento("  Zoom   Lento ") === "zoom lento"`.
- [ ] Mi cuenta muestra «Tomas con IA» (te quedan X de Y) y el paquete Video; nombre del contador en mensajes de límite: «tomas con IA».
- [ ] `npm test`, tsc. Commit «Video híbrido: reglas y contador de tomas con IA».

### Task 2: Cloudflare R2 (firma SigV4) y subida de fotos

**Files:** Create `lib/r2.ts` (+ `lib/r2.test.ts`, `import "server-only"`), `app/api/video-ia/subida/route.ts`.

**Produces:** `configR2(): { accountId, accessKeyId, secretAccessKey, bucket } | null`; `firmarUrl(metodo: "GET"|"PUT", llave: string, segundos: number, opts?: { tipo?: string; ahora?: Date; cfg? }): string` (presigned query SigV4, región `auto`, servicio `s3`, host `{accountId}.r2.cloudflarestorage.com`); `subirDesdeUrl(origen: string, llave: string, tipo: string, f?: typeof fetch): Promise<void>` (descarga y hace PUT firmado); `pedirSubida(uid, datos: { tipo: unknown; bytes: unknown; sha256: unknown }, deps?): Promise<{ ok: true; url: string; imagenKey: string } | Falla>` (dueño o miembro con plan activo/prueba; valida tipo, tamaño, sha256 hex de 64).
- [ ] Tests: vector oficial de AWS para URL prefirmada SigV4 (ejemplo «GET /test.txt» de la documentación de S3, con sus credenciales de ejemplo) reproducido con host/región parametrizables; llave con caracteres especiales codificada bien; `pedirSubida` rechaza tipo/tamaño/sha256 inválidos y sin sesión; sin configuración → 503 «Falta configurar el almacenamiento de videos. Avísale a InnovationTECH.».
- [ ] Commit «Video híbrido: almacenamiento en R2 y subida de fotos».

### Task 3: Trabajos, caché y cliente de fal.ai

**Files:** Modify `lib/account-store.ts`, `lib/account-store-memory.ts`, `lib/colecciones.ts` (+ tests); Create `lib/fal.ts` (+ test).

**Produces:**
- Tipos `TrabajoVideo` (campos de la spec, regla 4) y `EstadoTrabajo = "en_fila" | "enviado" | "listo" | "fallo"`.
- Store: `crearTrabajos(t: TrabajoVideo[])`, `getTrabajo(id)`, `listarTrabajos(ids: string[])`, `trabajosEnFila(limite: number)` (orden prioridad, creado), `contarEnviados()`, `marcarEnviado(id, datos: { falRequestId: string; statusUrl: string; responseUrl: string }, costo: number, dia: string, tope: number): Promise<"ok" | "tope" | "no_en_fila">` (transacción: trabajo + `gasto_video/{dia}`), `terminarTrabajo(id, cambios): Promise<boolean>` (solo si sigue `enviado`; idempotente), `ajustarGasto(dia, -centavos)`, `getCache(llave)`, `guardarCache(llave, clipKey)`, `tomarCandado(nombre, ms): Promise<boolean>`, `soltarCandado(nombre)`; colecciones `trabajos_video`, `cache_video`, `gasto_video`, `candados`.
- fal: `enviarAFal(modelo: string, input: { image_url: string; prompt: string; duration?: string }, webhook: string, f?): Promise<{ requestId: string; statusUrl: string; responseUrl: string }>`; `estadoFal(statusUrl, f?)`; `resultadoFal(responseUrl, f?): Promise<{ videoUrl: string } | null>`; `verificarFirmaFal(headers: Headers, cuerpo: string, ahora?: number, jwks?: () => Promise<{ x: string }[]>): Promise<boolean>` (ED25519 con `node:crypto`, mensaje `requestId\nuserId\ntimestamp\nsha256hex(cuerpo)`, ±300 s, JWKS en memoria ≤ 24 h).
- [ ] Tests: orden de la fila; `marcarEnviado` respeta tope y es atómico con dos llamadas a la vez; `terminarTrabajo` dos veces → la segunda false; caché; candado exclusivo; firma ED25519 válida con un par de llaves generado en la prueba, inválida si cambia el cuerpo o el timestamp tiene más de 300 s; `enviarAFal` arma la URL `https://queue.fal.run/{modelo}?fal_webhook=…` (codificada) y el encabezado `Authorization: Key …`.
- [ ] Commit «Video híbrido: cola de trabajos, caché y cliente de fal.ai».

### Task 4: Flujo del servidor (crear, despachar, aviso, consultar)

**Files:** Create `lib/video-ia.ts` (+ test), `app/api/video-ia/route.ts` (POST, GET), `app/api/video-ia/aviso/route.ts`, `netlify/functions/video-ia-respaldo.mts` (programada cada 5 min, llama `despachar()`); Modify `lib/account.ts` solo si hace falta pasar `negocio`/`saldo` usado a la reserva.

**Produces:** `crearVideo(req, datos: { tomas: { imagenKey: string; movimiento: string }[] }, deps?)` → `{ ok: true; trabajos: { id, estado }[] } | Falla`; `despachar(deps?): Promise<{ enviados: number }>`; `procesarAviso(url: URL, headers, cuerpo: string, deps?): Promise<{ status: number }>`; `consultar(uid, ids: string[], deps?)` → `{ trabajos: { id, estado, lugar?, clipUrl? }[], topeHoy: boolean }`.
- [ ] Tests (con stores en memoria, fal y R2 falsos): los 5 de Review Focus, más: `VIDEO_IA=off` → crear responde 503 «Los videos con IA están en pausa por ahora. Puedes generar el video con animación.» y despachar no envía; imagenKey de otro negocio → 403; cuota agotada → 429 del guardián; crear despacha al momento si hay lugar; aviso OK copia el clip a R2 y guarda caché; aviso ERROR → reintento hasta `maxIntentos`, luego fallo + devolución + gasto ajustado; atorado > 15 min con fal «COMPLETED» → se procesa; consultar no devuelve trabajos de otro negocio.
- [ ] Commit «Video híbrido: cola, despacho, aviso y estado».

### Task 5: Ensamble del video en el navegador

**Files:** Modify `lib/reel.ts` (+ test de lógica pura en `lib/reel-escenas.ts`).

**Produces:** `repartirEscenas(duracion: 10|15|20|30, fotos: number, tomas: number[]): { tipo: "foto" | "toma"; indice: number; segundos: number }[]` (tomas = índices de fotos con IA, 5 s cada una; el resto reparte el tiempo que queda entre las demás fotos, mínimo 1.5 s por foto, la suma = duración); `ReelOptions.clips?: (string | null)[]` (URL del clip por foto; si hay clip la escena lo reproduce en el canvas desde un `<video>` con CORS).
- [ ] Tests de `repartirEscenas`: sumas exactas, mínimos, 0/1/2 tomas, más fotos de las que caben → error claro.
- [ ] Commit «Video híbrido: escenas con clips en el motor de reels».

### Task 6: Pantalla del estudio

**Files:** Modify `app/reel-studio.tsx`, `app/globals.css`, `lib/locales/en.ts`; Create `lib/estados-video.ts` (+ test) para el texto de cada estado.

- [ ] Selector de duración (10/15/20/30), marcar hasta 2 fotos «con IA» (y un campo «movimiento» por toma), vista previa gratis inmediata (tomas simuladas con zoom), botón «Generar con IA» que sube las fotos marcadas (hash SHA-256 en el navegador, PUT a R2), crea el video y consulta cada 5 s.
- [ ] Estados exactos del documento: «Subiendo… N%», «Vista previa lista», «En fila, lugar N», «Toma X de Y · Generando…», «Listo», «Listo al instante» (caché), «Hoy ya no hay cupo; tu video se genera mañana», «No se pudo generar la toma, te devolvimos tu crédito». Demo: etiqueta «Demo gratis» y al final «Elige un plan para seguir creando videos con IA».
- [ ] Al quedar listas, `renderReel` con `clips`; las fallidas usan animación.
- [ ] Commit «Video híbrido: pantalla del estudio».

### Task 7: Stripe, guía y configuración

**Files:** Modify `lib/stripe-api.ts` (`prepararStripe` crea el paquete Video), `README.md`.
- [ ] Test: «Preparar Stripe» crea/encuentra `studio_paquete_video` ($15) y guarda su `stripePriceId`.
- [ ] README: variables nuevas, crear bucket R2 + regla de borrado de `demo/` a 30 días + CORS del bucket para el dominio de Studio, cuenta de fal.ai con crédito sin recarga automática, `VIDEO_IA=off`, costos.
- [ ] Commit «Video híbrido: paquete Video y guía».
