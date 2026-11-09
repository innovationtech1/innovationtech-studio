# Clave propia de Cloudflare guardada en la cuenta (cifrada)

Fecha: 8 de noviembre de 2026 · Diseño aprobado en conversación por Hector.

## Qué se quiere lograr

Hoy la clave propia de Cloudflare (Account ID + token de Workers AI) se guarda solo en el navegador: hay que escribirla en cada dispositivo y cada miembro del equipo. Ahora el **dueño la conecta una vez** y funciona en todos sus dispositivos y para todo su equipo, guardada **cifrada** en el servidor.

## Reglas

1. **Solo el dueño** conecta, cambia o desconecta. Los miembros la usan sin verla.
2. Antes de guardar, el servidor **prueba** la clave con la misma revisión de `/api/cf-test` (formato del Account ID, token activo, permiso de Workers AI). Si falla, no se guarda y se muestran los mismos mensajes.
3. Se guarda **cifrada con AES-256-GCM** (`node:crypto`), con la llave `STUDIO_CLAVES_SECRETO` (32 bytes en base64, solo en Netlify, marcada como secreta). IV aleatorio de 12 bytes por guardado; se guardan `iv`, `tag` y `datos` en base64, y `version: 1`.
4. Colección aparte: `${prefijo}claves_ia/{negocioId}` (`colecciones().clavesIa`). Las reglas de Firestore ya niegan todo acceso desde el navegador.
5. En el negocio solo se guarda lo visible: `iaPropia?: { cuentaFin: string /* últimos 4 del Account ID */; conectada: number /* ms */ }`. El token **nunca** se devuelve al navegador.
6. **Orden de uso** en cada pedido de IA de Cloudflare: (a) la clave del navegador en los encabezados `x-cf-account`/`x-cf-token` (como hoy); (b) la clave guardada del negocio; (c) la cuenta de InnovationTECH (variables de entorno). Con (a) o (b) **no se cuentan** los límites del mes ni se gasta saldo de paquetes.
7. Si falta `STUDIO_CLAVES_SECRETO` o el texto cifrado no se puede leer (llave cambiada), el pedido usa la cuenta de InnovationTECH con límites (como si no hubiera clave), se registra `console.error` sin datos sensibles, y Mi cuenta muestra «Tu Cloudflare conectado ya no se puede leer. Conéctalo otra vez.». Conectar sin la llave configurada responde 503 «Falta configurar el guardado seguro de claves. Avísale a InnovationTECH.».
8. Si Cloudflare responde que el token ya no sirve (401/403) usando la clave guardada, se devuelve el error de siempre y Mi cuenta sigue mostrando la clave conectada; el dueño puede reconectar. (No se borra sola.)
9. La clave de **Replicate** no cambia (sigue en el navegador).

## API

- `POST /api/cuenta/clave-ia` `{ accountId, token }` → prueba + guarda → `{ ok: true, cuentaFin }` | error con `checks`.
- `DELETE /api/cuenta/clave-ia` → borra el documento cifrado y `iaPropia` → `{ ok: true }`.
- `GET /api/cuenta` → `EstadoCuenta.iaPropia: { cuentaFin, conectada, legible: boolean } | null` (para todos los del negocio; `legible` false si no se puede descifrar).

## Pantallas

- **Mi cuenta** (dueño): sección «Tu cuenta de Cloudflare (opcional)»: si no está conectada, explica en una línea que sirve para usar Studio sin los límites del mes y abre el asistente existente (`setup-wizard`); si está conectada: «Conectada (cuenta …a1b2) · Sin límites del mes» y «Desconectar» con confirmación en la página. Miembros: solo la línea «Tu negocio usa su propia cuenta de Cloudflare».
- **Asistente** (`setup-wizard.tsx`) con cuentas activas y siendo dueño: el botón final guarda en la cuenta (POST) en lugar de en el navegador, y al terminar borra la clave del navegador si la había. Sin cuentas activas (modo demo) sigue como hoy.
- Si el navegador tiene una clave local y la cuenta no tiene una guardada: Mi cuenta ofrece «Guardar en tu cuenta» (dueño), que la sube con el mismo POST y la borra del navegador.

## Pruebas automáticas

- Cifrado: cifrar/descifrar ida y vuelta; IV distinto cada vez; texto alterado o llave distinta → error controlado; llave con largo incorrecto → error claro.
- API: solo el dueño (miembro 403); prueba fallida → no guarda; guardado → `iaPropia.cuentaFin`; DELETE borra ambos; sin llave → 503.
- Guardián / credenciales: con clave guardada, `requireAccess` no cuenta y `getCreds` usa la guardada; encabezados del navegador ganan; clave ilegible → cuenta de InnovationTECH con límites; ruta de Replicate no usa la clave de Cloudflare.
- `obtenerCuenta`: `iaPropia` sin token; `legible` false con llave cambiada.

## Para Hector

Crear en Netlify (todas las publicaciones: Production, Deploy Previews, Branch deploys) la variable `STUDIO_CLAVES_SECRETO`, marcada **Contains secret values**, con un valor generado en su computadora con PowerShell:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Puede ser un valor distinto para pruebas y para producción. Si la cambia después, las claves ya guardadas dejan de leerse y los clientes tienen que reconectar.
