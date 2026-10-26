# Cómo contribuir · How to contribute

¡Gracias por querer mejorar InnovationTECH Studio! *Thanks for helping improve InnovationTECH Studio!* (English below.)

## Español

### Antes de empezar

- Busca en los [issues](https://github.com/innovationtech1/innovationtech-studio/issues) si ya alguien reportó el problema o propuso la idea.
- Para cambios grandes, abre primero un issue para platicarlo.
- **Nunca subas claves, tokens ni datos personales** al repositorio, a un issue o a un pull request.

### Correr el proyecto

Necesitas Node.js 20 o más reciente.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # revisa que compile antes de enviar tu cambio
```

Para usar la IA gratis, conecta tu propia cuenta de Cloudflare desde **Ajustes** dentro de la app. Para probar el modo demo en local, crea un archivo `.env.local` con `CF_ACCOUNT_ID` y `CF_API_TOKEN` (no lo subas al repositorio).

### Cómo está hecho

- Next.js (App Router) con TypeScript y React. Casi todo se procesa en el navegador: editor (Konva), reels, video, música y quitar fondo.
- Las rutas de `app/api/` solo reenvían los pedidos a Cloudflare, Anthropic o Replicate con las claves de cada persona; no guardan nada.
- Los borradores se guardan en `localStorage` (`lib/persist.ts`) y la galería en IndexedDB (`lib/media-store.ts`).
- La estructura completa está en el [README](README.md#estructura-del-código).

### Textos e idiomas

- La interfaz se escribe en **español**, con frases simples y verbos claros (por ejemplo «Guardar marca», no «Enviar»).
- La traducción al inglés vive en `lib/locales/en.ts`: la clave es el texto en español tal como aparece en pantalla. **Si agregas o cambias un texto visible, agrega su traducción ahí.**
- Para un idioma nuevo, crea `lib/locales/<idioma>.ts` con el mismo formato y agrégalo en `lib/i18n.ts`.

### Enviar tu cambio

1. Haz un *fork* y crea una rama con un nombre descriptivo.
2. Haz commits pequeños con mensajes claros.
3. Revisa que `npm run build` pase y prueba en celular y en computadora.
4. Abre el *pull request* y llena la plantilla.

### Reglas de uso

- Solo bibliotecas y modelos con licencias que permitan uso comercial (MIT, Apache 2.0, etc.).
- La app debe seguir siendo usable gratis con Cloudflare.
- Sé amable y respetuoso con todas las personas.

## English

### Before you start

- Check the [issues](https://github.com/innovationtech1/innovationtech-studio/issues) to see if someone already reported the problem or suggested the idea.
- For big changes, open an issue first to discuss it.
- **Never commit keys, tokens or personal data**, and don't paste them into issues or pull requests.

### Run the project

You need Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # make sure it builds before sending your change
```

To use the free AI, connect your own Cloudflare account from **Settings** inside the app. To try demo mode locally, create a `.env.local` file with `CF_ACCOUNT_ID` and `CF_API_TOKEN` (don't commit it).

### How it's built

- Next.js (App Router) with TypeScript and React. Almost everything runs in the browser: the editor (Konva), reels, video, music and background removal.
- The `app/api/` routes only forward requests to Cloudflare, Anthropic or Replicate with each person's own keys; they don't store anything.
- Drafts live in `localStorage` (`lib/persist.ts`) and the gallery in IndexedDB (`lib/media-store.ts`).

### Text and languages

- The interface is written in **Spanish**. The English translation lives in `lib/locales/en.ts`, keyed by the Spanish text exactly as it appears on screen. **If you add or change visible text, add its translation there.**
- To add a new language, create `lib/locales/<lang>.ts` with the same format and register it in `lib/i18n.ts`.

### Send your change

1. Fork the repo and create a branch with a descriptive name.
2. Make small commits with clear messages.
3. Check that `npm run build` passes and test on a phone and a computer.
4. Open the pull request and fill in the template.

### Ground rules

- Only use libraries and models whose licenses allow commercial use (MIT, Apache 2.0, etc.).
- The app must stay usable for free with Cloudflare.
- Be kind and respectful to everyone.
