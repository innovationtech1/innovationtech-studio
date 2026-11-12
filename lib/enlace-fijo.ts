// Enlaces temporales de Netlify (uno por cada publicación, con 24 letras y números al inicio):
// el inicio de sesión con Google no los reconoce. Quien entra por uno se manda solo a la dirección fija.

type Env = Record<string, string | undefined>;

// La dirección fija de esta publicación: la del sitio en producción, la de la rama en una rama.
export function direccionFija(env: Env): string {
  if (env.CONTEXT === "production") return env.URL ?? "";
  if (env.CONTEXT === "branch-deploy") return env.DEPLOY_PRIME_URL ?? "";
  return "";
}

const TEMPORAL = /^[0-9a-f]{24}--(.+\.netlify\.app)$/;

// Devuelve a dónde mandar a quien está en un enlace temporal, o null si se queda donde está.
export function destinoFijo(actual: { host: string; pathname: string; search: string; hash: string }, fija: string): string | null {
  const sitio = TEMPORAL.exec(actual.host)?.[1];
  if (!sitio || !fija) return null;
  let destino: URL;
  try {
    destino = new URL(fija);
  } catch {
    return null;
  }
  // Solo al mismo sitio (el principal o una de sus ramas), nunca a otro
  if (destino.protocol !== "https:" || !(destino.host === sitio || destino.host.endsWith(`--${sitio}`))) return null;
  if (destino.host === actual.host) return null;
  return `${destino.origin}${actual.pathname}${actual.search}${actual.hash}`;
}
