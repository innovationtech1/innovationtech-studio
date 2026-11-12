# Editor de video · Entrega 3 (IA por clip y estirar tomas) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Animar o rehacer una sola foto con IA sin tocar las demás, volver a la toma anterior, hasta 8 tomas distintas por video, y estirar una toma (cámara lenta o repetir).

**Architecture:** Cada clip animado guarda el id de su toma (`trabajoId`), así el video se puede retomar, duplicar y volver a grabar sin pedir ni cobrar de nuevo. El servidor acepta una `variacion` por toma que cambia la llave del caché (para que «Rehacer» dé un clip nuevo). El motor repite o alenta el tramo de una toma.

**Spec:** `docs/superpowers/specs/2026-11-11-editor-video-design.md` («Tomas con IA por clip», «Decisiones aprobadas», entrega 3). Aprobación de Hector: «vamos a darle, al final hacemos pruebas».

## Global Constraints

- Hasta **8** tomas distintas por video (duplicados y vueltas a la anterior no cuentan de más). El Director sigue animando como máximo 4 al armar.
- «Rehacer» cuesta 1 toma; duplicar, volver a la anterior, estirar y volver a grabar no cuestan.
- Sin `variacion` (o con 0) la llave del caché es idéntica a la de hoy.
- Estirar: normal 5 s · cámara lenta 10 s · repetir ×2 10 s · repetir ×3 15 s. **Ida y vuelta no entra** (riesgo de fluidez anotado en la spec).
- Cambiar la foto o el movimiento de un clip animado descarta su toma (hay que animarlo de nuevo).
- El servidor sigue aceptando hasta 4 tomas por pedido; la app pide por partes.

## Review Focus

1. Una toma que falla: el clip conserva la anterior si la había; si no, vuelve a quedar sin toma y se ve con zoom.
2. Retomar tras cerrar la app: los `trabajoId` guardados se consultan y no se vuelve a cobrar.
3. Un `trabajoId` que el servidor ya no reconoce: se descarta y se avisa, sin bloquear el video.
4. Más de 8 tomas distintas: no deja exportar, con mensaje claro.
5. La llave del caché sin variación no cambia (los clips ya generados siguen sirviendo).

## Tasks

1. **Modelo** (`lib/linea-tiempo.ts`, pruebas): `trabajoId`, `anteriorTrabajoId`, `variacion`, `reproduccion`; `duracionClip` con estirar; `tomasDistintas`; `MAX_TOMAS = 8`; `rehacerToma`, `volverAnterior`, `ponerToma`; `cambiar` descarta la toma si cambia foto o movimiento; `aEscenas` con `repetir` y velocidad lenta.
2. **Servidor** (`lib/video-ia.ts`, pruebas): `variacion` en la toma pedida y en `llaveCache`.
3. **Motor** (`lib/reel.ts`): repetir el tramo N veces.
4. **Pantalla** (`app/linea-tiempo.tsx`, `app/reel-studio.tsx`): botones Animar / Rehacer / Volver a la anterior y estado por clip; selector de estirar; «Generar con IA» y el Director usan los `trabajoId`; enlaces frescos antes de grabar o previsualizar.
5. **Comprobación**: pruebas automáticas, compilación y navegador con el servidor de tomas simulado.
