# InnovationTECH Studio

Plataforma **open source** para crear contenido de marketing con inteligencia artificial: **textos, imágenes y videos**, todo en un mismo lugar y con la identidad de tu marca.

Cada persona usa **sus propias claves de API** y paga solo lo que genera. El código es libre (licencia MIT): cualquiera puede usarlo, instalarlo y mejorarlo.

## Qué puede hacer

| Módulo | Qué crea | Con qué |
|---|---|---|
| ✍️ Textos | Copys para redes, ganchos, hashtags, llamadas a la acción, ideas visuales | Claude (Anthropic) |
| 🖼️ Imágenes | Posts, historias, banners, fotos de producto (1:1, 4:5, 9:16, 16:9) | Modelos de imagen en Replicate (FLUX por defecto) |
| 🎬 Videos | Clips cortos para reels y anuncios, desde texto o animando una imagen | Modelos de video en Replicate |
| 🎨 Mi marca | Guarda nombre, giro, público, tono y colores; se aplican en todo | — |
| 📁 Galería | Historial de lo que creaste para descargarlo | — |

El flujo ideal: escribes la idea en **Textos**, la IA te da el copy y las descripciones visuales, y con un clic pasas a **Imágenes** y luego a **Videos** (incluso puedes animar la imagen que generaste).

## Privacidad de las claves

- Las claves se guardan **solo en el navegador** de cada persona (localStorage).
- En cada pedido viajan al servidor de la app, que las reenvía al proveedor y **no las almacena ni las registra**.
- Si hospedas la plataforma para otros, usa siempre HTTPS (Vercel lo incluye).

## Cómo conseguir las claves

1. **Anthropic (textos):** crea una cuenta en <https://console.anthropic.com>, agrega crédito y genera una API key.
2. **Replicate (imágenes y videos):** crea una cuenta en <https://replicate.com>, agrega un método de pago y copia tu token en *Account → API tokens*.

Luego, dentro de la app, ve a **⚙️ Configuración**, pega las dos claves y guarda.

> Los precios los fija cada proveedor y cambian con el tiempo; revisa sus páginas. Como referencia general, el texto es lo más barato, las imágenes cuestan centavos y el video es lo más caro.

## Opción 1: publicarla en internet (sin instalar nada)

1. Sube esta carpeta a un repositorio de **GitHub** (botón *Add file → Upload files*).
2. Entra a <https://vercel.com>, inicia sesión con GitHub y elige **Add New → Project**.
3. Selecciona el repositorio y presiona **Deploy**. No hace falta configurar nada.
4. En un par de minutos tendrás tu enlace (por ejemplo `innovationtech-studio.vercel.app`) para compartir.

> En el plan gratuito de Vercel las funciones tienen un límite de tiempo. Las imágenes y los videos funcionan porque el video se consulta por partes, pero si una imagen tarda demasiado, vuelve a intentarlo.

## Opción 2: correrla en tu computadora

Necesitas [Node.js](https://nodejs.org) versión 20 o más reciente.

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>.

## Cambiar de modelo

En **Configuración** puedes escribir cualquier modelo de Replicate, por ejemplo uno open source más nuevo:

- Imagen: `black-forest-labs/flux-schnell` (rápido y barato), `black-forest-labs/flux-dev`, u otro.
- Video: `minimax/video-01` por defecto; busca en <https://replicate.com/explore> la sección *video* para ver los modelos actuales.
- Texto: `claude-sonnet-5-5` por defecto; puedes usar cualquier modelo de Claude disponible en tu cuenta.

Los modelos usan el formato `dueño/nombre` o `dueño/nombre:version`. Si un modelo de video no acepta imagen inicial, deja ese campo vacío.

## Estructura del código

```
app/
  page.tsx              Interfaz completa (pestañas)
  api/text/route.ts     Textos con Claude
  api/image/route.ts    Imágenes con Replicate
  api/video/route.ts    Inicia un video
  api/video/[id]/       Consulta el estado del video
lib/
  replicate.ts          Conexión con Replicate
  brand.ts              Kit de marca
```

## Uso responsable

- No generes contenido con personas reales sin su permiso, ni logos o personajes de otras marcas.
- Revisa los términos de uso comercial de cada modelo antes de vender el contenido.
- Revisa siempre los textos antes de publicarlos.

## Próximos pasos (ideas para contribuir)

- Voz en off y música para los videos.
- Unir varios clips con subtítulos y logo en un reel final.
- Plantillas por industria (restaurantes, bienes raíces, salones, etc.).
- Calendario de publicaciones.
- Guardar la galería en la nube.

## Licencia

MIT © InnovationTECH. Puedes usar, copiar, modificar y distribuir este software libremente.
