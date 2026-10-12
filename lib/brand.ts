// Kit de marca: se guarda en el navegador de cada usuario y se añade a cada pedido a la IA.

export type Brand = {
  name: string;
  industry: string;
  audience: string;
  tone: string;
  colors: string;
  extra: string;
};

export const emptyBrand: Brand = {
  name: "",
  industry: "",
  audience: "",
  tone: "",
  colors: "",
  extra: "",
};

export function brandContext(b: Brand): string {
  const parts = [
    b.name && `Marca: ${b.name}`,
    b.industry && `Giro: ${b.industry}`,
    b.audience && `Público objetivo: ${b.audience}`,
    b.tone && `Tono de voz: ${b.tone}`,
    b.colors && `Colores de marca: ${b.colors}`,
    b.extra && `Notas: ${b.extra}`,
  ].filter(Boolean);
  return parts.join("\n");
}

// Versión corta para prompts de imagen y video.
export function brandVisual(b: Brand): string {
  const parts = [b.colors && `color palette: ${b.colors}`, b.industry && `for a ${b.industry} business`].filter(
    Boolean
  );
  return parts.length ? `, ${parts.join(", ")}` : "";
}
