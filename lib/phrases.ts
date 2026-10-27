// Utilidades para los textos que escribe la IA.

// Frases cortas del texto generado que sirven para poner sobre una imagen.
export function phrases(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    if (/^\s*(#[^\s#]+[\s,]*)+$/.test(raw)) continue; // solo hashtags
    let l = raw.replace(/\*+|^#+\s+|^[-•]\s*|^\d+[.)]\s*/g, "").trim();
    if (!l || /^PROMPT DE/i.test(l)) continue;
    l = l.replace(/^[A-ZÁÉÍÓÚÑ ]{3,30}:\s*/, "").trim(); // «GANCHO: …» → «…»
    if (l.length < 4 || l.length > 140 || /:$/.test(l)) continue;
    if (!out.includes(l)) out.push(l);
  }
  return out.slice(0, 12);
}

export function extract(text: string, label: string): string {
  const m = text.match(new RegExp(`${label}:?\\**\\s*(.+)`, "i"));
  return m ? m[1].replace(/\*+/g, "").trim() : "";
}
