# Video híbrido de 10 a 30 s desde fotos (con modo demo)

Fecha: 10 de noviembre de 2026 · Aprobado por Hector («apruebo como está») sobre el documento «Infraestructura imagen a video – InnovationTECH Studio» (https://claude.ai/artifact/5Gu8RzsVkgko6yRHiTq8zT), que es la fuente de los números y estados.

## Qué se construye

En el estudio de reels (`app/reel-studio.tsx`, motor `lib/reel.ts`) el cliente arma un video de **10, 15, 20 o 30 s** con sus fotos: animación gratis en el navegador (lo que ya hace `renderReel`) y **1 o 2 «tomas con IA» de 5 s** que generan movimiento real con **fal.ai**. La vista previa es gratis; solo las tomas con IA cuestan.

## Decisiones aprobadas

| Tema | Valor |
|---|---|
| Duraciones | 10, 15, 20 o 30 s |
| Tomas con IA por video | 0, 1 o 2 (de 5 s) |
| Demo (prueba gratis) | 1 toma con IA, modelo Wan 2.5 (480p) |
| Básico | 0 tomas incluidas; puede usar el paquete «Video» |
| Pro | 20 tomas con IA al mes (Kling 2.5 Turbo Pro), se reinician el día 1 |
| Paquete «Video» | +20 tomas con IA por $15, pago único, saldo que no vence (Básico y Pro) |
| Tope de gasto diario de todo Studio | $5 (hora de Chicago); el demo se pausa al 80% |
| Trabajos al mismo tiempo en fal.ai | 3 |
| Si falla | 1 reintento; luego se devuelve la toma y se usa animación |
| Atorados | más de 15 min sin aviso → reintento o fallo |
| Caché | misma imagen + mismo movimiento + mismo modelo → mismo clip, sin descontar |
| Archivos | Cloudflare R2 (S3), privados con enlaces temporales; los del demo se borran a los 30 días |
| Interruptor | `VIDEO_IA=off` apaga la IA de video al instante |

Modelos en fal.ai (precio para el control de gasto, editable en la configuración):
- `demo`: `fal-ai/wan-25-preview/image-to-video` (o el id vigente de Wan 2.5 en fal), 480p, **$0.05 / s** → $0.25 por toma.
- `estandar`: `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`, **$0.07 / s** → $0.35 por toma.
Los ids exactos se confirman en fal.ai al programar y viven en la configuración, no en el código.

## Reglas

1. **Contador nuevo `tomas_ia`** en el sistema de límites del mes y saldo de paquetes que ya existe (`limitesMes`, `reservarUso`, `paquetes`): prueba 1, básico 0, pro 20. Así la reserva, la devolución, el reinicio mensual, el saldo y la compra con Stripe funcionan igual que hoy.
2. **Herramienta `video_ia`**: hoy solo Pro con la clave propia de Replicate. Pasa a: prueba, básico y pro pueden pedir tomas (Básico solo con saldo). Con cuentas apagadas sigue el flujo viejo de Replicate sin cambios.
3. **Modelo por plan**: prueba → `demo`; básico/pro → `estandar`.
4. **Trabajo** = una toma: `{ id, negocioId, uid, plan, prioridad, modelo, imagenKey, movimiento, estado, intentos, falRequestId?, clipKey?, costoCentavos, creado, actualizado, secreto, reserva }` en `${prefijo}trabajos_video`. Estados: `en_fila` → `enviado` → `listo` | `fallo`. `reserva` = lo que devolver (mes/saldo).
5. **Prioridad**: pro = 1, pro con saldo o básico con saldo = 2, prueba = 3. Orden: prioridad, luego `creado`.
6. **Crear**: `POST /api/video-ia` con `{ tomas: [{ imagenKey, movimiento }] }` (1 o 2). Guardián `requireAccess` con `contador: "tomas_ia"`, `unidades` = tomas que **no** están en caché. Las que están en caché se entregan `listo` al instante sin descontar.
7. **Despacho** (`despachar()`, una función del servidor): si `VIDEO_IA=off` no hace nada. Toma hasta `3 - enviados` trabajos `en_fila` en orden; si el gasto del día + el costo del trabajo supera $5 (o el 80% para prioridad 3), no lo envía. Envía a `https://queue.fal.run/{modelo}?fal_webhook={URL}/api/video-ia/aviso?t={id}&s={secreto}` con un enlace temporal de lectura de la imagen en R2. Suma el costo al gasto del día **en la misma transacción** que marca `enviado`. **Se llama** al crear trabajos, al recibir cada aviso (se libera un lugar) y en cada consulta de estado de un cliente (`GET`), con un candado en Firestore para que dos llamadas no despachen el mismo trabajo. Así no depende de funciones programadas: en Netlify esas solo corren en la publicación de producción (no en la versión de prueba) y su frecuencia depende del plan. Una función programada (cada 5 min, solo producción) queda como respaldo.
8. **Aviso** (`POST /api/video-ia/aviso`): verifica la firma ED25519 de fal (cabeceras `X-Fal-Webhook-*`, claves de `https://rest.fal.ai/.well-known/jwks.json`, ±300 s) **y** el secreto del trabajo; responde 2xx siempre que el trabajo sea conocido (para que fal no reintente de más); es idempotente por `request_id`. `status: "OK"` → descarga `payload.video.url`, lo sube a R2 (`clipKey`), guarda en caché, `listo`. `"ERROR"` → reintento si `intentos < 2`, si no `fallo` + devolver la reserva + restar el costo del gasto del día.
9. **Atorados**: dentro de `despachar()`: `enviado` hace más de 15 min → consulta el estado en fal (`status_url`); terminado → procesa como el aviso; si no, reintento o fallo como arriba.
10. **Consultar**: `GET /api/video-ia?ids=…` (dueño o miembro del negocio) → estado, lugar en la fila, y enlace temporal al clip si está listo.
11. **Caché**: llave = SHA-256 de `negocioId` + el SHA-256 de la foto (el que manda el navegador al subir, y que forma su `imagenKey`) + `movimiento` normalizado + `modelo`. Un negocio nunca recibe el clip de otro. Documento `${prefijo}cache_video/{llave}` → `clipKey`.
12. **Subida**: `POST /api/video-ia/subida` `{ tipo, bytes, sha256 }` → enlace PUT firmado de R2 (5 min, solo `image/jpeg|png|webp`, ≤ 8 MB) y `imagenKey = negocios/{negocioId}/fotos/{sha256}.{ext}`. Firma SigV4 hecha con `node:crypto` (sin dependencias nuevas).
13. **Ensamble**: `renderReel` acepta en cada escena una imagen **o** un clip (video). La escena con clip dura 5 s y reproduce el clip en el canvas; las demás siguen con zoom y paneo. Duración total = la elegida; las fotos se reparten.
14. **Pantalla**: estados de la tabla del documento (Subiendo, Vista previa lista, En fila lugar N, Generando toma X de Y, Listo, Desde caché, Tope del día, Falló con crédito devuelto). Igual en demo y normal; el demo muestra «Demo gratis» y al final invita a elegir plan.
15. **Paquete «Video»** en `paquetes` (`video: { contenido: { tomas_ia: 20 }, monto: 15, planes: ["basico","pro"] }`, lookup_key `studio_paquete_video`); «Preparar Stripe» lo crea como los otros.

## Variables nuevas (Netlify, secretas)

`FAL_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; opcional `VIDEO_IA` (`on` por defecto si hay `FAL_KEY`).

## Fuera de alcance

Kling 3.0/4.0 y audio generado, videos 100 % IA, editar el clip después, guardar el proyecto completo en la nube (solo fotos y clips).
