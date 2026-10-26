// Idiomas de la interfaz (español e inglés).
// La app está escrita en español; en inglés se traduce lo que se ve en pantalla usando
// el diccionario de lib/locales/en.ts (textos, botones, avisos y mensajes de error).

import { EN, EN_PATTERNS } from "./locales/en";

export type Lang = "es" | "en";
const KEY = "its-lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* sin almacenamiento */
  }
  // Español por defecto (muchos clientes hispanos usan celulares en inglés); inglés se elige en el menú.
  return "es";
}

let current: Lang = typeof window === "undefined" ? "es" : detect();

export const getLang = () => current;
export const locale = () => (current === "en" ? "en-US" : "es-MX");

// Cambia de idioma y recarga la app (así cada texto se muestra ya traducido).
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sin almacenamiento */
  }
  current = l;
  location.reload();
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function lookup(text: string): string | null {
  const k = norm(text);
  if (!k || !/[a-záéíóúñ¿¡]/i.test(k)) return null;
  const hit = EN[k] ?? EN[text.trim()];
  if (hit) return hit;
  for (const [re, out] of EN_PATTERNS) if (re.test(k)) return k.replace(re, out);
  return null;
}

// Para textos que no pasan por la pantalla (diseños, plantillas, lienzos).
export function tr(s: string): string {
  if (current === "es") return s;
  return lookup(s) ?? s;
}

// ---------- Traducción de lo que se ve en pantalla ----------

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP = "textarea, script, style, pre.result, [data-no-translate], [contenteditable='true']";
const SKIP_ATTR = "[data-no-translate]";

function translateText(node: Text) {
  const v = node.nodeValue;
  if (!v || !v.trim()) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const t = lookup(v);
  if (t && t !== norm(v)) {
    const lead = v.match(/^\s*/)![0];
    const trail = v.match(/\s*$/)![0];
    node.nodeValue = lead + t + trail;
  }
}

function translateAttrs(el: Element) {
  if (el.closest(SKIP_ATTR)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const t = lookup(v);
    if (t && t !== v) el.setAttribute(a, t);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(root as Element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n as Text);
    else translateAttrs(n as Element);
    n = w.nextNode();
  }
}

export function startDomTranslation(): () => void {
  if (current === "es" || typeof document === "undefined") return () => {};
  document.documentElement.lang = "en";
  walk(document.body);
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") translateText(m.target as Text);
      else if (m.type === "attributes") translateAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => obs.disconnect();
}

// Avisa al servidor el idioma para que la IA escriba en inglés cuando corresponde.
export function installLangHeader() {
  if (current === "es" || typeof window === "undefined") return;
  const w = window as Window & { __itsLang?: boolean };
  if (w.__itsLang) return;
  w.__itsLang = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/") || url.includes(`${location.origin}/api/`)) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("x-lang", current);
      return orig(input, { ...init, headers });
    }
    return orig(input, init);
  };
}
