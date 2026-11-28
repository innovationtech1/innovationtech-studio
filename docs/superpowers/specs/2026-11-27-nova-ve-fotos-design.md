# NOVA ve tus fotos (proyecto B) — diseño

Fecha: 2026-11-27 · Sigue al diseño del creador guiado (parte 2) y a la hoja de ruta aprobada por Hector.

## Objetivo

Que la IA de Studio entienda lo que hay en una foto, en los tres lugares donde hoy se le pregunta a
ciegas: el creador guiado de video, «Una publicación» en Textos y el chat de NOVA (que hoy contesta
«no tengo la capacidad de ver imágenes» y no tiene botón para adjuntar).

Éxito: la persona sube una foto y lo que la IA escribe corresponde a lo que se ve, sin que tenga que
describirla. Si ver la foto falla, puede seguir escribiéndola a mano.

## Una sola pieza, tres usos

`POST /api/ver` recibe de 1 a 8 fotos pequeñas y devuelve una descripción corta por foto (o `null` si
esa foto no se pudo ver). Todo lo demás la usa:

1. **Creador guiado, paso 3.** Al entrar, NOVA ve las fotos y llena las líneas. La persona corrige.
2. **Textos → Una publicación.** «Adjuntar foto» junto a lo que se quiere publicar. Al generar, la
   descripción entra al pedido («En la foto se ve: …») y la foto queda puesta en «Publicar».
3. **Chat de NOVA.** Botón para adjuntar una foto al mensaje. NOVA recibe la descripción como parte
   de lo que dijo la persona y contesta con eso.

## Cómo ve

- El teléfono reduce cada foto a 768 px de lado mayor (JPEG) antes de enviarla. La original no se toca.
- Modelo: `@cf/meta/llama-3.2-11b-vision-instruct` de Cloudflare Workers AI, por la API REST que ya usa
  Studio: cuerpo con `messages` y la foto en el campo `image` (data URI). Una llamada por foto.
- Hasta 3 fotos a la vez. Cada foto: 20 s de tiempo máximo y un reintento.
- La instrucción pide una frase en español de máximo 15 palabras sobre lo que se ve (producto, lugar,
  acción), sin identificar personas ni adivinar nombre, edad, origen u otros datos de quien salga.
- La respuesta se limpia: una sola línea, sin comillas ni «En la imagen se ve», máximo 80 caracteres.

## Licencia del modelo

Cloudflare pide aceptar una vez la licencia de Meta: una llamada con `{"prompt":"agree"}`.

- Cuenta de la plataforma: botón «Activar NOVA ve tus fotos» en el panel de administrador. Lo toca
  Hector; la app no acepta nada por su cuenta.
- Quien usa su propia cuenta de Cloudflare: si su cuenta no la aceptó, ver fotos falla y aplica el
  camino manual. No se acepta en su nombre.

## Conteo y límites

- Un lote (hasta 8 fotos) cuenta como 1 texto del mes. Si ninguna foto se pudo ver, se devuelve.
- El tope es el de textos del plan: no hay un tope diario aparte (decisión: un contador menos que
  cuidar; el costo por foto es de fracciones de centavo).
- Fotos de más de 600 KB ya reducidas, o que no son JPEG/PNG/WebP, se rechazan con motivo.

## Sin callejones sin salida

- Mientras ve, NOVA lo dice («Estoy viendo tus fotos…»).
- A los 12 s aparece «Volver a intentar» y «Escribirlas yo», sin esperar a que termine.
- Si una foto falla, su línea queda vacía y se pide escribirla; las demás quedan llenas.
- Si falla todo: mensaje en palabras simples, «Volver a intentar» y seguir a mano. Nada se borra.
- En Textos y en el chat, si no se pudo ver la foto se avisa y el texto se genera sin ella.

## Privacidad

Studio no guarda las copias. La política vigente ya cubre el envío a Cloudflare de lo que se sube para
generar contenido. En cada lugar hay un aviso corto: «NOVA va a ver tu foto. No se guarda.»

## Entregas

- **B1.** `/api/ver`, botón de licencia en el panel y creador guiado paso 3.
- **B2.** Textos → Una publicación.
- **B3.** Chat de NOVA.

## Fuera de alcance

Editar fotos con IA (proyecto 2 de la hoja de ruta), ver videos, reconocer personas.
