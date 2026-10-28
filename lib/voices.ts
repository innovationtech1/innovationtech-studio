// Voces para la voz en off. Todas usan Cloudflare Workers AI (incluido en el uso gratis diario).
// - «Natural»: Deepgram Aura-2, voces muy humanas con acento de cada país.
// - «Básica»: MeloTTS, más robótica pero gasta muchísimo menos del uso gratis.

export type Voice = {
  id: string;
  name: string;
  gender: "mujer" | "hombre";
  accent: string;
  lang: "es" | "en";
  model: string;
  speaker?: string;
  basic?: boolean;
};

const ES = "@cf/deepgram/aura-2-es";
const EN = "@cf/deepgram/aura-2-en";
const MELO = "@cf/myshell-ai/melotts";

export const VOICES: Voice[] = [
  // Español
  { id: "es-selena", name: "Selena", gender: "mujer", accent: "Latinoamérica", lang: "es", model: ES, speaker: "selena" },
  { id: "es-estrella", name: "Estrella", gender: "mujer", accent: "México", lang: "es", model: ES, speaker: "estrella" },
  { id: "es-celeste", name: "Celeste", gender: "mujer", accent: "Colombia", lang: "es", model: ES, speaker: "celeste" },
  { id: "es-carina", name: "Carina", gender: "mujer", accent: "España", lang: "es", model: ES, speaker: "carina" },
  { id: "es-diana", name: "Diana", gender: "mujer", accent: "España", lang: "es", model: ES, speaker: "diana" },
  { id: "es-javier", name: "Javier", gender: "hombre", accent: "Latinoamérica", lang: "es", model: ES, speaker: "javier" },
  { id: "es-aquila", name: "Aquila", gender: "hombre", accent: "Latinoamérica", lang: "es", model: ES, speaker: "aquila" },
  { id: "es-sirio", name: "Sirio", gender: "hombre", accent: "México", lang: "es", model: ES, speaker: "sirio" },
  { id: "es-alvaro", name: "Álvaro", gender: "hombre", accent: "España", lang: "es", model: ES, speaker: "alvaro" },
  { id: "es-nestor", name: "Néstor", gender: "hombre", accent: "España", lang: "es", model: ES, speaker: "nestor" },
  { id: "es-basica", name: "Básica", gender: "mujer", accent: "Gasta menos uso gratis", lang: "es", model: MELO, basic: true },
  // English
  { id: "en-asteria", name: "Asteria", gender: "mujer", accent: "English", lang: "en", model: EN, speaker: "asteria" },
  { id: "en-luna", name: "Luna", gender: "mujer", accent: "English", lang: "en", model: EN, speaker: "luna" },
  { id: "en-thalia", name: "Thalia", gender: "mujer", accent: "English", lang: "en", model: EN, speaker: "thalia" },
  { id: "en-athena", name: "Athena", gender: "mujer", accent: "English", lang: "en", model: EN, speaker: "athena" },
  { id: "en-apollo", name: "Apollo", gender: "hombre", accent: "English", lang: "en", model: EN, speaker: "apollo" },
  { id: "en-orion", name: "Orion", gender: "hombre", accent: "English", lang: "en", model: EN, speaker: "orion" },
  { id: "en-arcas", name: "Arcas", gender: "hombre", accent: "English", lang: "en", model: EN, speaker: "arcas" },
  { id: "en-zeus", name: "Zeus", gender: "hombre", accent: "English", lang: "en", model: EN, speaker: "zeus" },
  { id: "en-basica", name: "Basic", gender: "mujer", accent: "Gasta menos uso gratis", lang: "en", model: MELO, basic: true },
];

export const DEFAULT_VOICE = { es: "es-selena", en: "en-asteria" } as const;

export const findVoice = (id: string | undefined) => VOICES.find((v) => v.id === id);

// Frase corta para escuchar cómo suena cada voz.
export const SAMPLE = {
  es: "Hola, así sueno en tus videos. ¡Gracias por elegirnos!",
  en: "Hi, this is how I sound in your videos. Thanks for choosing us!",
};
