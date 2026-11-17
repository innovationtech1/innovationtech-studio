# NOVA en el Asistente de Studio — diseño (etapa 1)

Fecha: 2026-11-16 · Aprobado por Hector («arma un plan para la construcción de NOVA y darle»).
Documento completo para el dueño: https://claude.ai/artifact/EW9yYSpvTJPAXH3HUdRh2b

## Intención
El Asistente de textos (`app/assistant-chat.tsx` + `app/api/chat/route.ts`) se convierte en **NOVA**: la asistente oficial de InnovationTECH Studio, con cara (sello de InnovationTECH), voz propia, conocimiento real de Studio y del plan del cliente, respuestas casi inmediatas y sugerencias cuando el cliente está inactivo. Para todos los planes. La memoria del negocio entre conversaciones es la etapa 2 («Nova Studio IA», de pago) y NO entra aquí.

## Metas
1. Personalidad e instrucciones de NOVA (tono moderno, cálido, breve; español por defecto; nunca inventa precios, cifras, testimonios ni recuerdos; no explica la arquitectura interna; no pide datos sensibles; no promete resultados).
2. Manual de Studio dentro de la app (cómo usar cada herramienta, qué significa cada estado, qué hacer si algo falla), enviado a la IA con cada mensaje.
3. Datos reales del cliente con el mensaje: plan, límites, uso del mes, lo que le queda, saldo de paquetes, precios y paquetes disponibles (de `useCuenta()`, sin lecturas extra de Firestore).
4. Dos velocidades: rápida (modelo ligero de Cloudflare) para dudas de uso/plan; creativa (el modelo actual `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) para textos.
5. Pantalla: encabezado NOVA (sello `public/icons/icon-192.png` en círculo, punto verde «En línea · tu asistente de Studio»), saludo con el nombre del negocio, 4 atajos («Crear un comercial», «Ideas para publicar», «¿Cómo uso Studio?», «Mi plan y mis límites»), los botones actuales (Copiar, Escuchar, Llevar al editor, Crear la imagen, Otra respuesta, ajustes rápidos).
6. Hasta 3 ideas de imagen por respuesta creativa, cada una con «Crear esta imagen» (usa el flujo `onImage` existente, que ya pide confirmación antes de gastar).
7. Animación del sello: «respira» mientras escribe/habla; tras 45 s sin actividad con NOVA visible, late y muestra una burbuja de sugerencia (máx. 1 cada 3 min; nada con `prefers-reduced-motion`). Sugerencias de una lista local que usa plan y marca; no gastan IA.
8. Voz de NOVA: Deepgram Aura-2 en Cloudflare, voz fija «estrella» (es) / «luna» (en), por una ruta propia; interruptor «NOVA habla» (apagado al inicio, recordado en el aparato) que lee sugerencias y respuestas en partes de ≤ 400 letras; si falla, voz del aparato. No consume el contador «voces» del plan. Dictado = el `MicButton` existente.

## No metas
Memoria entre conversaciones, base de datos de NOVA, otra IA de pago, generar imágenes dentro del chat, conversación manos libres continua, cambios en la NOVA del sitio web.

## Anti-metas
Que NOVA invente recuerdos o precios; que hable sin que el cliente lo active; que agote el uso gratis de Cloudflare o Firebase; romper el Asistente con cuentas apagadas o con el proveedor Anthropic.

## Enfoques
- Instrucciones + manual + datos en el mensaje (elegido): rápido, sin búsquedas, costo casi $0.
- RAG con base de datos de manuales (descartado en etapa 1): agrega espera y lecturas para un manual pequeño.
- Integrar la app NOVA existente (Gemini) por iframe/API (descartado): otro proveedor, otra cuota y no conoce la cuenta del cliente.

## Decisiones de Claude
Voz «estrella» (México) por ser latinoamericana y natural; 45 s / 3 min para las sugerencias; 400 letras por audio; ruta de voz sin contador pero con tope por usuario en memoria del servidor (1 pedido cada 3 s) y tope de texto; selección de modelo por atajo o por palabras clave de la pregunta.
