# Subir InnovationTECH Studio a Google Play

Studio es una aplicación web que ya se puede instalar desde el navegador. En Google Play se publica como
«Trusted Web Activity» (TWA): una app de Android muy pequeña que abre el sitio a pantalla completa. No hay
que rehacer la aplicación: cada mejora que se publica en el sitio llega sola a la app.

> Las reglas de Google Play cambian seguido. Esta guía se escribió en noviembre de 2026; antes de cada paso
> confirma en la Play Console lo que diga Google en ese momento.

## Lo que ya está listo en el sitio

- Manifiesto de la app, íconos de 192 y 512 px (normales y adaptables) y funcionamiento sin conexión.
- Términos (`/terminos`) y Política de privacidad (`/privacidad`), que Google exige.
- «Borrar mi cuenta» dentro de la app, que Google exige cuando hay cuentas.
- La dirección `/.well-known/assetlinks.json`, que enlaza el sitio con la app. Se llena con dos variables
  de Netlify (paso 4).

## Antes de empezar: dos decisiones

### 1. Cuenta personal o de organización

- **Personal:** se abre en minutos, pero Google exige una **prueba cerrada con al menos 12 personas durante
  14 días seguidos** antes de dejar publicar. Cuenta con unas tres semanas para el primer lanzamiento.
- **Organización:** no tiene esa prueba, pero pide un número D-U-N-S del negocio, que puede tardar semanas.
  InnovationTECH hoy es un negocio a nombre de una persona, así que lo normal es la cuenta personal.

### 2. Cómo se cobra dentro de la app

Studio cobra con Stripe. Google permite cobros fuera de su sistema, pero bajo sus programas: hay que
inscribirse, reportar las ventas y **pagarle a Google una comisión** (alrededor del 10 % en suscripciones,
según lo publicado en 2026; confirma la cifra vigente). Dos caminos:

- **A. Vender dentro de la app de Play** con Stripe, inscrito en el programa de Google y pagando su comisión.
- **B. App «solo para usar» (la elegida, ya programada):** la app de Play no muestra precios, botones de
  compra ni instrucciones de pago; el cliente contrata en el sitio web o contigo (Cash App, efectivo) y en
  la app solo inicia sesión. Studio lo hace sola cuando se abre desde la app de Play (`lib/app-play.ts`):
  para eso el paquete debe abrir la dirección `/?app=play` (paso 2).

Esta decisión cambia cuánto ganas por cliente: tómala antes de publicar y, si puedes, con tu contador.

## Pasos

### Paso 1. Crear la cuenta de desarrollador

1. Entra a https://play.google.com/console/signup con la cuenta de Google del negocio.
2. Elige el tipo de cuenta, paga el registro (pago único de 25 USD) y verifica tu identidad.

### Paso 2. Generar el paquete de la app

1. Abre https://www.pwabuilder.com y escribe `https://innovationtech-studio.netlify.app`.
2. Elige **Package for stores → Android**.
3. Abre las opciones del paquete y en **Start URL** escribe `/?app=play`. Es lo que le dice a Studio que
   está dentro de la app de Play y debe ocultar las compras. **No lo omitas.**
4. Anota el **Package ID** que propone (por ejemplo `app.netlify.innovationtech_studio.twa`) o escribe uno
   propio. No se puede cambiar después de publicar.
5. Descarga el archivo. Trae el `.aab` (lo que se sube a Google) y un archivo de firma con sus contraseñas:
   **guárdalo en un lugar seguro**; sin él no podrás publicar actualizaciones del paquete.

### Paso 3. Crear la app en la Play Console y subir el paquete

1. **Crear app** → nombre «InnovationTECH Studio», idioma español, tipo App, gratis.
2. En **Pruebas → Prueba cerrada**, crea una versión y sube el `.aab`.
3. Acepta **Firma de apps de Google Play** (Play App Signing).

### Paso 4. Enlazar el sitio con la app

1. En la Play Console: **Configuración → Integridad de la app → Firma de apps**. Copia la
   **huella digital del certificado SHA-256** de la clave de firma de la app.
2. En Netlify → **Environment variables**, crea dos variables (en Production):
   - `ANDROID_PACKAGE` = el Package ID del paso 2
   - `ANDROID_SHA256` = la huella copiada (si hay más de una, sepáralas con comas)
3. **Deploys → Trigger deploy**.
4. Abre `https://innovationtech-studio.netlify.app/.well-known/assetlinks.json`: debe mostrar el paquete y
   la huella. Si muestra `[]`, alguna de las dos variables está vacía o mal escrita.

Si este enlace falta, la app funciona pero muestra la barra de direcciones del navegador arriba.

### Paso 5. Llenar la ficha y los formularios

- **Ficha de la tienda:** descripción corta y larga, ícono de 512 px (ya existe en `public/icons`),
  **gráfico de funciones de 1024 × 500 px** (hay que crearlo) y **al menos 2 capturas de teléfono**.
  Las capturas del manifiesto (390 × 844) no sirven para la ficha: Google pide que el lado largo no pase
  del doble del corto. Usa capturas de 1080 × 1920.
- **Política de privacidad:** `https://innovationtech-studio.netlify.app/privacidad`
- **Seguridad de los datos:** declara lo que dice la Política de privacidad (correo y nombre de la cuenta,
  contenido que crea el usuario, pagos procesados por Stripe).
- **Eliminación de cuentas:** indica que se hace dentro de la app, en Mi cuenta → Borrar mi cuenta.
- **Clasificación de contenido**, **público objetivo** (adultos, negocios) y **anuncios** (no tiene).
- **Acceso a la app:** como pide iniciar sesión, dale a Google una cuenta de prueba con un plan activo
  para que sus revisores puedan entrar.
- **Contenido generado con IA:** Studio crea textos, imágenes y video con IA; Google pide una forma de
  reportar contenido ofensivo. Studio ya tiene «Reportar un problema».

### Paso 6. Prueba cerrada

1. Invita a los probadores por correo (mínimo 12 si la cuenta es personal).
2. Cada uno acepta la invitación e instala la app desde el enlace de la prueba.
3. Deben seguir inscritos 14 días seguidos. Si alguno se sale, deja de contar.

### Paso 7. Pedir acceso a producción

Al cumplir los 14 días, en la Play Console aparece **Solicitar acceso a producción**. Google pregunta cómo
fue la prueba y qué cambiaste. Después de aprobarlo, publica la versión en **Producción**.

## Lo que hay que cuidar después

- La app de Play abre el sitio: **no hace falta subir una versión nueva** por cada mejora de Studio.
- Solo se sube un paquete nuevo si cambian el nombre, el ícono o el Package ID, o si Google exige una
  versión más nueva de Android.
- Si se cambia el dominio del sitio, hay que generar otro paquete y actualizar `assetlinks.json`.
