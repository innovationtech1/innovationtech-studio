# Director con IA · Entrega A (Reel con mis imágenes) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la persona escriba o dicte una orden en el Creador de Reels y la IA arme el video completo o lo corrija, gastando lo mínimo.

**Architecture:** La IA solo traduce la orden a una lista de acciones de un catálogo fijo (una llamada de texto). Un módulo puro (`lib/director.ts`) valida esas acciones y calcula el nuevo estado del video y lo que queda pendiente de gasto; `app/reel-studio.tsx` aplica el estado y ejecuta los pendientes con las funciones que ya existen. La pantalla es un componente nuevo (`app/director.tsx`).

**Tech Stack:** Next.js 15, React, TypeScript, `node:test` con `tsx`; proveedor de textos existente (`/api/text`).

**Spec:** `docs/superpowers/specs/2026-11-11-director-ia-design.md`

## Global Constraints

- Una orden = **una** llamada de texto (1 «texto» del saldo). Orden de máximo 500 caracteres. Máximo 20 acciones por orden.
- `armar`: clips de 2 a 12 (por defecto 4); cada foto de **7 a 10 s** (por defecto 8); guion a unas 2.3 palabras por segundo.
- Imágenes y voz nunca se gastan sin la confirmación «Esta orden usa N imágenes y M voz. Hacerlo / Cancelar».
- El Director **nunca** lanza tomas con IA de pago; solo puede marcar la foto (máximo 4).
- No se mandan imágenes a la IA; solo textos y números del video.
- Si la IA no devuelve acciones válidas: «No entendí la orden. Dila de otra forma.», el video no cambia y se devuelve el texto gastado.
- Sin dependencias nuevas. Textos visibles en español con su traducción en `lib/locales/en.ts`.
- TDD: cada prueba se ve fallar antes de implementar. Suite completa con `npm test`.

## Review Focus

1. **JSON basura o a medias de la IA** (texto alrededor, campos de más, tipos equivocados, acción desconocida): se descarta lo malo sin romper nada. → pruebas en Task 1.
2. **Números de clip que cambian a mitad de la orden** («agrega dos clips y pon texto en el 6»): las acciones se aplican en orden y el clip se busca en ese momento. → prueba en Task 2.
3. **`armar` sobre un video con fotos:** no borra ninguna foto ni su texto se pierde sin querer; solo completa. → prueba en Task 2.
4. **Plan sin voz o sin cuenta para IA:** la voz o el «animar» se omiten con aviso y el resto se hace. → prueba en Task 2.
5. **Cancelar la confirmación:** el video queda idéntico (ni clips ni ajustes cambian). → prueba de navegador en Task 6.

---

### Task 1: Catálogo y validación (`lib/director.ts`)

**Files:**
- Create: `lib/director.ts`
- Test: `lib/director.test.ts`

**Interfaces:**
- Produces:

```ts
export const MAX_ACCIONES = 20, MAX_ORDEN = 500, FOTO_DIRECTOR = 8, MIN_FOTO_DIRECTOR = 7, MAX_FOTO_DIRECTOR = 10, CLIPS_DEFECTO = 4;
export type RefClip = number | "todos";                     // número desde 1, como en pantalla
export type Accion =
  | { tipo: "armar"; tema: string; clips: number; segundosPorFoto: number; textos: string[]; imagenes: string[]; cta: string; guion: string; musica?: string }
  | { tipo: "agregar_clip"; cantidad: number }
  | { tipo: "borrar_clip"; clip: number }
  | { tipo: "mover_clip"; clip: number; a: number }
  | { tipo: "duplicar_clip"; clip: number }
  | { tipo: "duracion"; clip: RefClip; segundos: number }
  | { tipo: "duracion_total"; segundos: number }
  | { tipo: "texto"; clip: number; texto: string }
  | { tipo: "estilo_texto"; clip: RefClip; posicion?: TextoPos; tamano?: TextoTam }
  | { tipo: "imagen"; clip: number; descripcion: string }
  | { tipo: "animar"; clip: number; activar: boolean; movimiento?: string }
  | { tipo: "formato"; valor: "9:16" | "1:1" | "16:9" }
  | { tipo: "cierre"; negocio?: string; cta?: string }
  | { tipo: "guion"; texto: string }
  | { tipo: "voz"; genero?: "mujer" | "hombre"; voz?: string; generar?: boolean; quitar?: boolean }
  | { tipo: "subtitulos"; activar: boolean }
  | { tipo: "musica"; activar?: boolean; estilo?: string; volumen?: number | "subir" | "bajar" }
  | { tipo: "vista_previa" }
  | { tipo: "crear_video" };
export type Catalogo = { estilos: string[]; voces: { id: string; genero: "mujer" | "hombre" }[] };
export function validarAcciones(json: unknown, cat: Catalogo): { acciones: Accion[]; descartadas: number };
export function clipsPara(segundos?: number): number;       // duración pedida ÷ 8, entre 2 y 12; sin duración: 4
```

`json` es lo que devuelve la ruta: se acepta `{acciones:[…]}` o directamente la lista. La IA escribe las llaves como en la spec (`segundos_por_foto`, `tipo`); la validación las pasa a los nombres de arriba.

- [ ] **Step 1: Pruebas que fallan** en `lib/director.test.ts` (una por comportamiento):
  - Una acción válida de cada tipo pasa y sale con sus campos normalizados.
  - Rangos: `duracion.segundos` 0.2 → 1.5 y 40 → 15; `duracion_total` 500 → 120 y 1 → 5; `agregar_clip.cantidad` 99 → 10; `armar.clips` 30 → 12, sin `clips` → 4; `segundos_por_foto` 3 → 7, 20 → 10, sin valor → 8; `musica.volumen` 150 → 100, `"subir"` pasa.
  - Textos: `texto.texto` de 300 caracteres se corta a 120; `guion.texto` a 1500; `armar.textos` y `armar.imagenes` se cortan o rellenan (con `""` y con `"<tema>, advertising photography, high quality"`) hasta `clips`.
  - Se descartan y cuentan en `descartadas`: tipo desconocido (`"explotar"`), `clip: "dos"`, `clip: 0`, `clip: 2.5`, `formato.valor: "4:3"`, `musica.estilo` fuera del catálogo, `voz.voz` fuera del catálogo, `estilo_texto` sin posición ni tamaño, `texto` sin `texto`, elementos que no son objeto.
  - `clip: "todos"` solo vale en `duracion` y `estilo_texto`; en `borrar_clip` se descarta.
  - 25 acciones válidas → quedan 20 y `descartadas` 5.
  - `null`, `"hola"`, `{}`, `{acciones: "x"}` → `{acciones: [], descartadas: 0}`.
  - `clipsPara(30)` → 4; `clipsPara(60)` → 8 (57 s de fotos ÷ 8, redondeado: se descuenta el cierre de 3 s); `clipsPara(200)` → 12; `clipsPara(5)` → 2; `clipsPara()` → 4.
- [ ] **Step 2:** Run: `node --conditions=react-server --import tsx --test lib/director.test.ts` → FAIL («Cannot find module './director'»).
- [ ] **Step 3: Implementar** tipos, constantes, `validarAcciones` y `clipsPara`. Módulo puro.
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5: Commit** `git commit -m "Director con IA: catálogo de acciones y validación"`

---

### Task 2: Aplicar acciones, pendientes y costo (`lib/director.ts`)

**Files:**
- Modify: `lib/director.ts`, `lib/director.test.ts`

**Interfaces:**
- Consumes: `Accion`, `Catalogo` (Task 1); `Clip`, `mover`, `duplicar`, `borrar`, `cambiar`, `nuevoClip`, `MAX_TOMAS`, `SEGUNDOS_TOMA`, `CIERRE` de `lib/linea-tiempo.ts`.
- Produces:

```ts
export type Ajustes = { formato: "9:16" | "1:1" | "16:9"; negocio: string; cta: string; guion: string; vozId: string; hayVoz: boolean; subtitulos: boolean; musica: boolean; estilo: string; volumen: number /* 0 a 1 */ };
export type Estado = { clips: Clip[]; ajustes: Ajustes };
export type Pendiente =
  | { tipo: "imagen"; clipId: string; descripcion: string }
  | { tipo: "voz"; ajustarFotos: boolean }      // ajustarFotos: tras generar, repartir las fotos para cubrirla (solo en armar)
  | { tipo: "quitar_voz" }
  | { tipo: "vista_previa" }
  | { tipo: "crear_video" };
export type Permisos = { voz: boolean; ia: boolean };   // el plan incluye voz / hay sesión para marcar tomas con IA
export type Resultado = { estado: Estado; pendientes: Pendiente[]; hecho: string[]; avisos: string[] };
export function aplicarAcciones(estado: Estado, acciones: Accion[], cat: Catalogo, permisos: Permisos): Resultado;
export function costoDe(pendientes: Pendiente[]): { imagenes: number; voces: number };
export function textoCosto(c: { imagenes: number; voces: number }): string | null;  // null si no gasta
export function resumenProyecto(estado: Estado): Record<string, unknown>;           // lo que se manda a la IA (sin imágenes)
```

- [ ] **Step 1: Pruebas que fallan** (se agregan al mismo archivo):
  - `borrar_clip`, `mover_clip` (`clip: 1, a: 3`), `duplicar_clip`, `agregar_clip` cambian la lista como las funciones de la línea de tiempo; `hecho` trae una línea por acción («Borré el clip 2», «Moví el clip 1 al lugar 3», «Dupliqué el clip 1», «Agregué 2 clips»).
  - Clip inexistente: `texto` con `clip: 9` en una lista de 4 → sin cambios, `avisos` = [«No existe el clip 9»].
  - En orden: `[agregar_clip 2, texto clip 6 "Hola"]` sobre 4 clips → el clip 6 tiene «Hola» y no hay avisos.
  - `duracion` con `"todos"` cambia solo las fotos; `estilo_texto` con `"todos"` pone posición y tamaño en todos.
  - `duracion_total 30` con 3 fotos y cierre → cada foto 9 s; con una toma (5 s) y 2 fotos → fotos de 11 s; nunca fuera de 1.5–15.
  - `imagen` → no cambia la foto; guarda `prompt` en el clip y agrega pendiente `{tipo:"imagen", clipId, descripcion}`.
  - `animar` con `permisos.ia` false → aviso «Inicia sesión para animar fotos con IA»; en clip sin foto → aviso; quinta toma → aviso «Máximo 4 fotos con IA por video»; caso normal → `tipo: "toma"` y `movimiento`.
  - `formato`, `cierre`, `guion`, `subtitulos`, `musica` (activar, estilo, volumen 40 → 0.4, `"subir"` +0.15 y `"bajar"` −0.15 dentro de 0–1) cambian `ajustes`. Cambiar `guion` con `hayVoz` → `hayVoz` false y aviso «Cambió el guion: genera la voz de nuevo».
  - `voz` con `genero: "hombre"` elige la primera voz de hombre del catálogo; `generar` sin guion → aviso «Escribe primero el guion»; `generar` con `permisos.voz` false → aviso «Tu plan no incluye voz» y sin pendiente; `quitar` → pendiente `quitar_voz`.
  - `armar` sobre 4 clips vacíos con `clips: 4, segundosPorFoto: 8` → 4 clips con sus textos, `prompt` y 8 s; `ajustes.cta`, `guion`, música; pendientes: 4 imágenes + voz (`ajustarFotos: true`).
  - `armar` con `clips: 3` sobre `[foto, vacío, vacío, vacío, vacío]` → quedan 3 clips; el primero conserva su `image` y recibe el texto nuevo; solo 2 pendientes de imagen.
  - `armar` con `clips: 2` sobre 3 clips con foto → los 3 se conservan (nunca se borra una foto); textos solo en los 2 primeros.
  - `armar` con `permisos.voz` false → sin pendiente de voz y aviso «Tu plan no incluye voz».
  - `vista_previa` y `crear_video` → pendientes; si vienen los dos queda solo `crear_video`.
  - `costoDe` cuenta imágenes y voces; `textoCosto({imagenes:4, voces:1})` → «Esta orden usa 4 imágenes y 1 voz.»; `{imagenes:1, voces:0}` → «Esta orden usa 1 imagen.»; `{0,0}` → `null`.
  - `resumenProyecto` no contiene ninguna `image` ni `imageId`; trae por clip `{n, tipo, segundos, foto: boolean, texto}`.
  - `aplicarAcciones` no modifica el `estado` que recibe.
- [ ] **Step 2:** Run: mismo comando de Task 1 → FAIL (funciones inexistentes).
- [ ] **Step 3: Implementar.** `armar`: conserva todo clip con foto; de los vacíos deja solo los necesarios para llegar a `clips`; agrega los que falten.
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5: Commit** `git commit -m "Director con IA: aplicar acciones, pendientes y costo"`

---

### Task 3: Instrucciones para la IA y modo `director` en la ruta de textos

**Files:**
- Modify: `lib/director.ts`, `lib/director.test.ts`, `app/api/text/route.ts`

**Interfaces:**
- Produces:

```ts
// lib/director.ts
export function instruccionesDirector(o: { resumen: Record<string, unknown>; estilos: { id: string; nombre: string }[]; voces: { id: string; nombre: string; genero: string }[]; marca?: string; ingles?: boolean }): { system: string; user(orden: string): string };
```

Ruta: `POST /api/text` con `{ mode: "director", prompt: <orden>, estado: <resumen>, provider, model, brand }` → `200 { acciones: unknown[], mensaje: string }`; orden de más de 500 caracteres → 400 «La orden es muy larga (máximo 500 caracteres).»; sin JSON o sin lista `acciones` → devuelve el uso (`acceso.devolver()`) y 502 «No entendí la orden. Dila de otra forma.».

- [ ] **Step 1: Prueba que falla:** `instruccionesDirector` → el `system` nombra los 19 tipos de acción, dice «Responde SOLO con un objeto JSON», incluye los ids de estilos y voces recibidos, la regla de 7 a 10 segundos por foto y la de `clips = duración ÷ 8`, la de 2.3 palabras por segundo para el guion y «nunca inventes acciones»; `user("quita el clip 2")` incluye la orden y el resumen en JSON; con `ingles: true` pide el contenido en inglés conservando las llaves.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implementar `instruccionesDirector`.** Incluir 3 ejemplos cortos de orden → JSON (uno de `armar`, uno de edición, uno de «no se puede»: `{"acciones": [], "mensaje": "…"}`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Ruta.** En `app/api/text/route.ts`: leer `estado` del cuerpo; rama `mode === "director"` antes de `reel`; `Gen` gana `temperatura?: number` (el director usa 0.2; los demás siguen en 0.8); `maxTokens` 1500. Estilos de `MUSIC_STYLES` y voces de `VOICES` del idioma del pedido.
- [ ] **Step 6:** Run: `npx tsc --noEmit && npm test` → sin errores.
- [ ] **Step 7: Commit** `git commit -m "Director con IA: instrucciones y modo director en la ruta de textos"`

---

### Task 4: Bloque de pantalla (`app/director.tsx`)

**Files:**
- Create: `app/director.tsx`
- Modify: `app/globals.css` (estilos `.dir-*`), `lib/locales/en.ts`

**Interfaces:**
- Produces:

```tsx
export default function Director(props: {
  ocupado: boolean;
  cfHeaders: Record<string, string>;                     // para el micrófono (MicButton)
  onEnviar(orden: string): void;
  confirmar: { texto: string; onSi(): void; onNo(): void } | null;
  resultado: { mensaje: string; hecho: string[]; avisos: string[] } | null;
  onDeshacer: (() => void) | null;                       // null = no hay orden que deshacer
}): JSX.Element;
```

- [ ] **Step 1: Implementar.** Título «Director con IA»; campo de texto (máx. 500, Enter envía), `MicButton` que escribe en el campo, botón **Enviar** (apagado si está vacío u ocupado); tres ejemplos tocables que llenan el campo; si `confirmar`: su texto con **Hacerlo** y **Cancelar**; si `resultado`: `mensaje`, lista de `hecho`, `avisos` en tono de aviso, y **Deshacer orden** si `onDeshacer`. El campo se vacía al enviar.
- [ ] **Step 2: Estilos** `.dir`, `.dir-fila`, `.dir-ejemplos`, `.dir-resultado`; objetivo táctil de 44 px; a 390 px nada se sale.
- [ ] **Step 3: Traducciones** de cada texto nuevo.
- [ ] **Step 4:** Run: `npx tsc --noEmit` → sin errores.
- [ ] **Step 5: Commit** `git commit -m "Director con IA: bloque de órdenes"`

---

### Task 5: Integración en el Creador de Reels (`app/reel-studio.tsx`)

**Files:**
- Modify: `app/reel-studio.tsx`, `lib/locales/en.ts`, `README.md`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Estado y permisos.** `estadoActual(): Estado` junta `clipsRef.current` y los ajustes; `catalogo` de `MUSIC_STYLES` y `VOICES` del idioma; `permisos = { voz: usePuede("voz"), ia: conCuenta }`.
- [ ] **Step 2: Enviar.** `enviarOrden(orden)` dentro de `run("Pensando tu orden…")`: `POST /api/text` modo `director` con `resumenProyecto(estadoActual())`; `validarAcciones`; sin acciones válidas → error «No entendí la orden. Dila de otra forma.» (o el `mensaje` de la IA si lo trae); `aplicarAcciones`; si `textoCosto(costoDe(pendientes))` → guardar la propuesta y mostrar la confirmación; si no → `confirmarOrden(propuesta)`.
- [ ] **Step 3: Confirmar.** Guarda la foto de antes (`clips`, ajustes y la voz actual) para «Deshacer orden»; aplica clips con `editar` (un paso de Deshacer) y cada ajuste con su `set…`; pone los pendientes en una **cola en estado**. Cancelar descarta la propuesta sin tocar nada.
- [ ] **Step 4: Ejecutar la cola** en un efecto que corre cuando hay cola y la app no está ocupada (así usa los ajustes ya aplicados): imágenes de 3 en 3 con `makeImage(clipId, descripcion)`; voz con `generarVoz(vozId, guion)` (separar de `makeVoice` la parte que no usa `run`); `quitar_voz`; si `ajustarFotos`, al conocerse la duración de la voz aplicar `ajustarAVoz`; al final `verPrevia()` o `buildReel()` si se pidieron. Lo que falle se agrega a `avisos` y lo demás sigue.
- [ ] **Step 5: Deshacer orden.** Restaura la foto de antes (clips con `reconciliar`, ajustes y voz) y borra el resultado.
- [ ] **Step 6: Pantalla.** `<Director …/>` arriba del paso 1. «Empezar nuevo» también limpia el resultado y la propuesta.
- [ ] **Step 7: README** (una línea en la fila de Reels) y traducciones.
- [ ] **Step 8:** Run: `npx tsc --noEmit && npm test && npm run build` → todo en verde.
- [ ] **Step 9: Commit** `git commit -m "Director con IA: órdenes en el Creador de Reels"`

---

### Task 6: Comprobación en navegador

**Files:** ninguno del proyecto.

- [ ] **Step 1:** Con `next start` y Playwright, simulando la respuesta de `/api/text` (y de `/api/image` con una imagen fija):
  - Orden de edición sin gasto (`mover_clip`, `estilo_texto todos`, `musica`): se aplica sin confirmación; el resumen lista lo hecho; **Deshacer orden** regresa el orden de los clips.
  - Orden `armar` de 4 clips: aparece «Esta orden usa 4 imágenes y 1 voz.»; **Cancelar** deja clips y ajustes idénticos (comparar lo guardado antes y después); al repetir y tocar **Hacerlo**: 4 clips de 8 s con texto y foto, contador 0:35.
  - Respuesta basura de la IA (502 simulado): mensaje «No entendí la orden…» y nada cambia.
  - Clip inexistente: aviso «No existe el clip 9».
  - 390 px: el bloque no se sale y los botones miden 44 px o más.
- [ ] **Step 2:** Anotar qué se comprobó y qué no (IA real y dictado por voz los prueba Hector en la versión de prueba).
