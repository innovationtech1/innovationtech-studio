// Biblioteca de canciones completas grabadas por músicos, de FreePD.com (dominio público, CC0):
// se pueden usar en anuncios, Instagram, TikTok, Facebook y YouTube sin pagar ni dar crédito.
// Versiones de 75 segundos con volumen parejo en /public/library (ver public/library/CREDITOS.md).

import type { MusicGroup } from "./music";

export type LibrarySong = { id: string; title: string; emoji: string; desc: string; group: MusicGroup };

export const LIBRARY: LibrarySong[] = [
  { id: "advertime", title: "Advertime", emoji: "📣", desc: "Hecha para anuncios: alegre y con ritmo", group: "animada" },
  { id: "funshine", title: "Funshine", emoji: "☀️", desc: "Soleada y positiva", group: "animada" },
  { id: "ukulele-feliz", title: "Happy Whistling Ukulele", emoji: "🎶", desc: "Ukulele y silbido, simpática", group: "animada" },
  { id: "ciudad-soleada", title: "City Sunshine", emoji: "🏙️", desc: "Ligera y moderna, para tiendas", group: "animada" },
  { id: "celebracion", title: "Celebration", emoji: "🎉", desc: "Festejo, aniversarios y ofertas", group: "animada" },
  { id: "energia", title: "Energizing", emoji: "⚡", desc: "Con energía, para lanzamientos", group: "animada" },
  { id: "en-movimiento", title: "Gotta Keep On Movin", emoji: "🏃", desc: "Movida, para gimnasios y deporte", group: "animada" },
  { id: "funk", title: "Funkeriffic", emoji: "🕺", desc: "Funk con groove", group: "animada" },
  { id: "groovin", title: "Groovin", emoji: "😎", desc: "Ritmo relajado con estilo", group: "animada" },
  { id: "inspiracion", title: "Inspiration", emoji: "🌅", desc: "Inspiradora, para historias de marca", group: "tranquila" },
  { id: "elevate", title: "Elevate Inspirate", emoji: "🚀", desc: "Crece poco a poco, motivadora", group: "tranquila" },
  { id: "esperanza", title: "Hopeful", emoji: "🌱", desc: "Esperanzadora y cálida", group: "tranquila" },
  { id: "estrellas", title: "Shining Stars", emoji: "✨", desc: "Brillante y emotiva", group: "tranquila" },
  { id: "piano-bonito", title: "Lovely Piano Song", emoji: "🎹", desc: "Piano suave, bodas y regalos", group: "tranquila" },
  { id: "atardecer", title: "Martini Sunset", emoji: "🍸", desc: "Lounge elegante, bares y restaurantes", group: "tranquila" },
  { id: "relax", title: "Be Chillin", emoji: "☕", desc: "Relajada, cafeterías", group: "tranquila" },
  { id: "pina-colada", title: "Pina Colada", emoji: "🍹", desc: "Tropical y veraniega", group: "latina" },
  { id: "cumbish", title: "Cumbish", emoji: "🪗", desc: "Con sabor a cumbia", group: "latina" },
  { id: "rio-bravo", title: "Del Rio Bravo", emoji: "🌵", desc: "Guitarra con aire mexicano", group: "latina" },
  { id: "epico", title: "Epic Blockbuster 2", emoji: "🎬", desc: "Épica de película", group: "intensa" },
  { id: "trailer", title: "Kings Trailer", emoji: "👑", desc: "Tráiler dramático, «muy pronto»", group: "intensa" },
  { id: "accion", title: "Action Strike", emoji: "💥", desc: "Acción e intensidad", group: "intensa" },
  { id: "carrera", title: "City Run", emoji: "🏁", desc: "Rápida y urbana (37 s)", group: "intensa" },
  { id: "navidad", title: "Deck the Halls", emoji: "🎄", desc: "Navideña", group: "animada" },
];

const cache = new Map<string, Promise<AudioBuffer>>();

// Descarga y prepara una canción de la biblioteca (queda en memoria y, con la app instalada, sin internet).
export function loadSong(id: string, ctx?: BaseAudioContext): Promise<AudioBuffer> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/library/${id}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo descargar la canción. Revisa tu conexión.");
        return r.arrayBuffer();
      })
      .then((data) => {
        const dc = ctx || new OfflineAudioContext(2, 1, 44100);
        return new Promise<AudioBuffer>((resolve, reject) => {
          const res = dc.decodeAudioData(data, resolve, reject);
          if (res && typeof (res as Promise<AudioBuffer>).then === "function") (res as Promise<AudioBuffer>).then(resolve, reject);
        });
      });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
