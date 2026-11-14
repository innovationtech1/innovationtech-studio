// Créditos y licencias de lo que InnovationTECH Studio incluye o usa (música, sonidos, tipografías,
// modelos y código abierto). Varias de estas licencias piden que el reconocimiento esté a la vista:
// por eso es una página pública (/creditos), enlazada desde el pie de la app.
// Si se agrega una canción, un banco de sonidos, una tipografía o un modelo, se anota aquí.

import type { DocumentoLegal } from "./legal";

export const CREDITOS: Record<"es" | "en", DocumentoLegal> = {
  es: {
    titulo: "Créditos y licencias",
    actualizado: "Última actualización: 13 de noviembre de 2026",
    secciones: [
      {
        titulo: "1. Canciones de la biblioteca",
        parrafos: [
          "Las canciones completas de la biblioteca vienen de FreePD.com (recopiladas en SoundSafari/CC0-1.0-Music) y están dedicadas al dominio público con la licencia CC0 1.0. Se pueden usar en anuncios y redes sociales sin pagar regalías ni dar crédito.",
          "Studio incluye versiones de hasta 75 segundos, con volumen igualado y final desvanecido.",
        ],
      },
      {
        titulo: "2. Música que compone la app e instrumentos",
        parrafos: [
          "La música «sin derechos» se compone dentro de tu navegador y es una obra nueva cada vez. Se toca con grabaciones de instrumentos de FluidR3_GM, de Frank Wen (Copyright © 2000-2002, 2008 Frank Wen), en la versión de gleitz/midi-js-soundfonts. FluidR3 se publicó con licencia MIT y esa versión se distribuye con licencia Creative Commons Atribución 3.0.",
          "La batería y los efectos de sonido (whoosh, impacto, caja registradora y otros) son muestras de Sonic Pi, recopiladas en danigb/samples, con licencia CC0 1.0 (dominio público).",
          "La percusión (congas, bongós, shaker, pandero, aplausos y otros) es de la Versilian Community Sample Library (VCSL), con licencia CC0 1.0.",
        ],
      },
      {
        titulo: "3. Tipografías",
        parrafos: [
          "La interfaz usa Bricolage Grotesque e Instrument Sans. Los diseños y videos pueden usar tipografías de Google Fonts (Anton, Bebas Neue, Lobster, Montserrat y otras). Todas tienen licencias abiertas (SIL Open Font License o Apache 2.0) que permiten el uso comercial.",
        ],
      },
      {
        titulo: "4. Modelos de inteligencia artificial",
        parrafos: [
          "Quitar fondo funciona en tu dispositivo con BiRefNet (lite), de Peng Zheng y colaboradores, con licencia MIT, y con Transformers.js de Hugging Face (Apache 2.0).",
          "Los textos, imágenes, voces y subtítulos se generan con modelos disponibles en Cloudflare Workers AI (entre ellos Llama de Meta, FLUX de Black Forest Labs, Whisper de OpenAI, MeloTTS de MyShell y Aura de Deepgram). El video con IA se genera a través de fal.ai. Cada proveedor tiene sus propios términos de uso.",
          "Lo que generas con IA es tu responsabilidad: revisa que no use marcas, personas o material de terceros sin permiso.",
        ],
      },
      {
        titulo: "5. Código abierto",
        parrafos: [
          "Studio está hecho con software libre: Next.js y React (MIT), Konva (MIT), Lucide (ISC), mp4-muxer (MIT), fix-webm-duration (MIT), JSZip (MIT), react-markdown y remark-gfm (MIT), Firebase (Apache 2.0) y la biblioteca de Stripe (MIT).",
          "El código de InnovationTECH Studio se publica con licencia MIT.",
        ],
      },
    ],
  },
  en: {
    titulo: "Credits and licenses",
    actualizado: "Last updated: November 13, 2026",
    secciones: [
      {
        titulo: "1. Library songs",
        parrafos: [
          "The full songs in the library come from FreePD.com (collected in SoundSafari/CC0-1.0-Music) and are dedicated to the public domain under CC0 1.0. They can be used in ads and on social media without royalties or credit.",
          "Studio includes versions up to 75 seconds long, with leveled volume and a fade-out ending.",
        ],
      },
      {
        titulo: "2. Music composed by the app and instruments",
        parrafos: [
          "The royalty-free music is composed inside your browser and is a new work every time. It is played with instrument recordings from FluidR3_GM by Frank Wen (Copyright © 2000-2002, 2008 Frank Wen), in the gleitz/midi-js-soundfonts version. FluidR3 was released under the MIT license and that version is distributed under Creative Commons Attribution 3.0.",
          "Drums and sound effects (whoosh, impact, cash register and others) are Sonic Pi samples, collected in danigb/samples, under CC0 1.0 (public domain).",
          "Percussion (congas, bongos, shaker, tambourine, claps and others) is from the Versilian Community Sample Library (VCSL), under CC0 1.0.",
        ],
      },
      {
        titulo: "3. Fonts",
        parrafos: [
          "The interface uses Bricolage Grotesque and Instrument Sans. Designs and videos can use Google Fonts typefaces (Anton, Bebas Neue, Lobster, Montserrat and others). All have open licenses (SIL Open Font License or Apache 2.0) that allow commercial use.",
        ],
      },
      {
        titulo: "4. Artificial intelligence models",
        parrafos: [
          "Background removal runs on your device with BiRefNet (lite) by Peng Zheng and contributors, under the MIT license, and Hugging Face Transformers.js (Apache 2.0).",
          "Text, images, voices and captions are generated with models available on Cloudflare Workers AI (including Meta's Llama, Black Forest Labs' FLUX, OpenAI's Whisper, MyShell's MeloTTS and Deepgram's Aura). AI video is generated through fal.ai. Each provider has its own terms of use.",
          "What you generate with AI is your responsibility: check that it doesn't use third-party brands, people or material without permission.",
        ],
      },
      {
        titulo: "5. Open source",
        parrafos: [
          "Studio is built with free software: Next.js and React (MIT), Konva (MIT), Lucide (ISC), mp4-muxer (MIT), fix-webm-duration (MIT), JSZip (MIT), react-markdown and remark-gfm (MIT), Firebase (Apache 2.0) and the Stripe library (MIT).",
          "The InnovationTECH Studio code is published under the MIT license.",
        ],
      },
    ],
  },
};
