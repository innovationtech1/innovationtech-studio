# Compartir y Guardar en Google Drive — diseño

Fecha: 2026-11-15 · Aprobado por Hector («vamos a darle a todo»).

## Intención
Que el cliente de InnovationTECH Studio, al terminar un video (o diseño), lo pueda **mandar en un toque** a sus redes y apps (TikTok, Instagram, WhatsApp, YouTube, Facebook…) y **guardarlo en la nube** (Google Drive) para conservarlo y compartirlo, incluso si es largo. Hoy solo se puede descargar; los proyectos viven solo en el aparato.

## Metas
1. Botón **«Compartir»** junto a cada «Descargar» de un resultado listo (video del Creador de Reels / Editor / Director, y los resultados de la Galería).
2. Botón **«Guardar en Google Drive»** en los mismos lugares.
3. Costo cero para InnovationTECH: nada pasa por nuestro servidor ni por R2.

## No metas (por ahora)
- Publicar directo en TikTok / Instagram / Facebook / YouTube con sus APIs (requieren aprobación de cada empresa, semanas; IG/FB piden cuenta de negocio).
- Guardar proyectos editables en la nube / sincronizar entre aparatos (proyecto aparte, anotado para después).
- Leer o listar el Drive del usuario.

## Anti-metas
- Pedir acceso a todo el Drive del usuario.
- Subir el video a nuestro servidor para reenviarlo (costo y privacidad).
- Romper el «Descargar» actual o mostrar botones que no funcionan en ese aparato.

## Enfoques considerados
- **Compartir:** (a) menú de compartir del sistema (Web Share con archivo) — elegido: gratis, sin aprobaciones, abre las apps instaladas; (b) APIs de cada red — descartado ahora (aprobaciones, cuentas de negocio); (c) enlaces «compartir en…» con URL — no sirven para un archivo de video local.
- **Drive:** (a) Google Identity Services (token en el navegador, permiso `drive.file`) + subida reanudable directa del navegador a Drive — elegido: gratis, sirve para videos grandes, permiso mínimo; (b) pedir el permiso extra en el inicio de sesión de Firebase con Google — descartado: no sirve a quien entró con correo y mezcla permisos con el login; (c) subir a nuestro servidor y de ahí a Drive — descartado: costo, límites de tamaño de funciones (6 MB) y privacidad.

## Diseño
### Compartir
- Componente reutilizable (p. ej. `app/compartir.tsx`) que recibe el archivo (Blob/URL + nombre + tipo) y un texto opcional (el texto/caption del anuncio si existe).
- Si `navigator.canShare({ files })` → `navigator.share({ files, text })`. Cancelar el menú no es error.
- Si no se puede compartir archivos → descarga el archivo y muestra «Súbelo desde tu computadora a la red que quieras».
- Ya existe un patrón igual en `app/image-editor.tsx:873-877` y `app/carousel-studio.tsx:289`: unificar con el componente nuevo donde sea sencillo, sin cambiar su comportamiento.

### Guardar en Google Drive
- Configuración pública `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (es pública, como la de Firebase). Sin ella, el botón de Drive no aparece.
- Al tocarlo por primera vez se carga el script de Google Identity Services y se pide un token con el permiso `https://www.googleapis.com/auth/drive.file` (solo archivos que Studio cree). El token vive en memoria (no se guarda en el aparato ni en el servidor); si caduca se vuelve a pedir.
- Busca o crea la carpeta «InnovationTECH Studio» en el Drive del usuario (con `drive.file` solo ve las carpetas que la app creó; guardar el id de la carpeta en el aparato para reusarla).
- Sube con **subida reanudable** (resumable upload) en trozos, con barra «Subiendo a Drive… N%» y botón Cancelar. Reintenta un trozo ante un fallo de red.
- Al terminar: «Guardado en Drive» con enlace «Abrir en Drive» (`webViewLink`).
- Errores claros: permiso negado, sin espacio en Drive, sin conexión. Nunca se registran tokens.
- Todos los textos con su traducción en `lib/locales/en.ts`.

### Dónde aparecen
- `app/reel-studio.tsx` junto a «Descargar video» (y «Descargar portada» si aplica).
- Galería en `app/page.tsx` (~1260, ~1296) para los resultados guardados.
- Diseños de imagen/carrusel: el botón Compartir actual pasa al componente; Drive también ahí.
- El Director con IA y el Editor de video, donde entreguen un video terminado.

### Pasos del dueño (una vez)
En Google Cloud (proyecto de Firebase `innovationtech-nova`): activar «Google Drive API»; configurar la pantalla de permisos (nombre de la app, correo, logo, enlaces de Privacidad y Términos); crear «ID de cliente OAuth — Aplicación web» con orígenes autorizados `https://innovationtech-studio.netlify.app`, `https://pruebas--innovationtech-studio.netlify.app` y `http://localhost:3000`; poner el ID en Netlify como `NEXT_PUBLIC_GOOGLE_CLIENT_ID` y volver a publicar. `drive.file` no es un permiso sensible: no requiere la verificación larga de Google.

### Legal
Privacidad: mencionar que, si el usuario lo pide, Studio guarda el archivo en **su propio** Google Drive con un permiso limitado a los archivos que Studio crea; InnovationTECH no recibe ni guarda el token.

## Para el que construye
Detalles del componente, estilos (celular primero, paleta de marca), orden exacto de los botones y manejo de tamaños grandes quedan a su criterio, siguiendo los patrones del proyecto. Pruebas unitarias para la lógica pura (decidir compartir vs. descargar, trozos de la subida reanudable, armado de peticiones a Drive con `fetch` inyectado).

## Respuestas y decisiones (revisión del constructor)
- **De dónde sale el archivo:** el Creador de Reels entrega un Blob local (`URL.createObjectURL`, `reel-studio.tsx:160,349,448`). La Galería guarda `it.url` (puede ser `data:`, `blob:` o un enlace remoto). El componente acepta Blob o URL; si es URL, la convierte a Blob con `fetch`; si un enlace remoto no se deja leer (CORS), Compartir/Drive se ocultan para ese elemento y queda el «Descargar» de siempre. *(decisión de Claude)*
- **Formato:** en Android el video puede salir en WebM; algunas apps (p. ej. Instagram) no aceptan WebM al compartir. No se convierte el video en esta etapa; si `canShare` dice que no, se descarga con el aviso. Se anota como límite conocido. *(decisión de Claude)*
- **Navegadores dentro de otras apps (Instagram, Facebook, TikTok) y popups bloqueados:** el script de Google se precarga cuando aparece el botón, y el token se pide directo en el toque (sin esperas antes del popup). Si Google no puede abrirse (navegador dentro de una app o popup bloqueado), se muestra «Abre Studio en Chrome o Safari para guardar en Google Drive.». *(decisión de Claude)*
- **Seguridad del sitio:** no hay Content-Security-Policy en el proyecto (revisado `netlify.toml`, `next.config`, `public/_headers`), así que nada bloquea `accounts.google.com` ni `www.googleapis.com`.
- **Subida reanudable:** trozos de 8 MiB (múltiplos de 256 KiB, como pide Google), un reintento por trozo con espera corta, y retomar desde el último byte confirmado. *(decisión de Claude)*
- **Botones existentes:** el editor de imágenes (un archivo) pasa al componente nuevo; el carrusel (varios archivos) usa la misma función de compartir con una lista de archivos. Se mantiene que cancelar el menú no muestra error. *(decisión de Claude)*
- **Pruebas:** el proyecto ya usa `node:test` (`npm test`); no se instala nada nuevo.
- **Legal:** solo `lib/legal.ts` (español e inglés), subiendo `VERSION_LEGAL`.
