# Editor de video · Entrega 4 (proyectos y portada) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Guardar varios videos en el dispositivo (hasta 20, con nombre) y cambiar entre ellos, y elegir una portada del video terminado.

**Architecture:** Un proyecto es una copia de todo lo que el Creador de Reels ya guarda en el dispositivo (`its-draft:reel:*`). Un módulo puro (`lib/proyectos.ts`) guarda, cambia, crea, renombra y borra proyectos sobre el almacenamiento del navegador. Una barra nueva (`app/reel-proyectos.tsx`) envuelve al Creador de Reels y lo vuelve a montar al cambiar de proyecto. La portada es un bloque junto al video terminado.

**Spec:** `docs/superpowers/specs/2026-11-11-editor-video-design.md` («Extras de edición», «Guardado», entrega 4). «Armar desde el guion» ya lo cubre el Director con IA. Aprobación de Hector: «vamos a darle, al final hacemos pruebas».

## Global Constraints

- Hasta **20** proyectos; el borrador actual pasa a ser el primero («Mi video»).
- Cambiar de proyecto nunca pierde lo escrito en el actual.
- Borrar un proyecto borra sus fotos y sus videos subidos **solo** si ningún otro proyecto los usa.
- La limpieza de videos sin usar respeta los videos de todos los proyectos.
- Portada: JPG al tamaño del video, del momento elegido.

## Review Focus

1. Primer uso: quien ya tenía un borrador lo encuentra como «Mi video», intacto.
2. Borrar el proyecto activo: se pasa a otro (o a uno nuevo en blanco); nunca queda sin proyecto.
3. Dos proyectos con el mismo video subido (duplicado): borrar uno no deja al otro sin archivo.
4. Proyecto número 21: mensaje claro, no se crea.
5. Datos dañados en el almacenamiento: se empieza con «Mi video» sin romper la app.

## Tasks

1. `lib/proyectos.ts` con pruebas (almacenamiento simulado).
2. `app/reel-proyectos.tsx` (barra de proyectos) y uso en `app/page.tsx`; el Creador de Reels recibe los videos de otros proyectos para no borrarlos.
3. Portada del video terminado.
4. Comprobación en navegador.
