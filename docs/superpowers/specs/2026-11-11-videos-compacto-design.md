# Videos compacto — ordenar y fusionar la pantalla del Creador de Reels

Fecha: 2026-11-11 · Estado: aprobado por Hector en el chat («aprobado») e implementado el mismo día.

## Qué pidió

«Organizar todas las funcionalidades; si algunas se pueden fusionar, mejor. La idea es que la aplicación sea compacta y veloz.»

## Qué se hizo

| Antes | Ahora |
|---|---|
| Director con IA + paso 1 «¿De qué trata el reel?» con «Crear todo con IA» | Una sola caja «¿Qué video quieres?» (texto, micrófono, Enviar). Un tema que llega del calendario o del asistente queda escrito ahí. |
| Pasos 4 (voz) y 5 (música) | Una sección plegable «Sonido» |
| Paso 3 (cierre) y selector de formato | Secciones plegables «Marca y cierre» y «Formato», con resumen en el título |
| Panel del clip en una lista larga | Pestañas dentro del clip: Imagen o video · Texto · Animar con IA |
| Botones de crear al final de la página | Barra fija abajo: duración, Vista previa, Crear reel, Generar con IA, y los avisos |
| Tres pestañas en Videos | Dos: «Crear video» y «Editar mis videos». La de «Video con IA · Replicate» se quitó de la pantalla (la ruta `/api/video` y su código siguen en el repositorio por si se quiere volver) |
| Toda la app se cargaba al abrir | Videos, el calendario y el editor de imágenes se cargan la primera vez que se abren |

## Medición

Primera carga de la app: de 270 kB a 218 kB de JavaScript (la página, de 134 kB a 81 kB).

## Lo que no cambió

Textos, Imágenes, Editor, Galería y Configuración. Ninguna otra función se quitó.
