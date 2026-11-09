"use client";

import { useEffect, useState } from "react";
import { getLang, startDomTranslation, type Lang } from "@/lib/i18n";
import type { DocumentoLegal } from "@/lib/legal";

// Vista de un documento legal (Términos o Privacidad) en el idioma de la interfaz.
// El texto legal ya viene escrito en los dos idiomas (lib/legal.ts): va dentro de data-no-translate
// para que el traductor automático no lo cambie. Solo se traducen los enlaces de arriba y abajo.

export default function LegalDoc({
  docs,
  otro,
}: {
  docs: Record<Lang, DocumentoLegal>;
  otro: { href: string; texto: string };
}) {
  // En el servidor siempre es español; en el navegador se usa el idioma elegido en el menú
  const [lang, setLangVista] = useState<Lang>("es");
  useEffect(() => {
    setLangVista(getLang());
    return startDomTranslation();
  }, []);
  const doc = docs[lang];

  return (
    <main className="legal">
      <a className="acct-link legal-volver" href="/">
        ← Volver a Studio
      </a>
      <article data-no-translate lang={lang}>
        <h1>{doc.titulo}</h1>
        <p className="legal-fecha">{doc.actualizado}</p>
        {doc.secciones.map((s) => (
          <section key={s.titulo}>
            <h2>{s.titulo}</h2>
            {s.parrafos.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </article>
      <nav className="legal-pie">
        <a className="acct-link" href={otro.href}>
          {otro.texto}
        </a>
        <a className="acct-link" href="/">
          ← Volver a Studio
        </a>
      </nav>
    </main>
  );
}
