"use client";

// Un video que corre solo, sin sonido y en bucle, mientras está a la vista (miniaturas de la Galería).
// Al salir de la pantalla se pausa, para no gastar batería. Si la persona pidió menos movimiento en su
// aparato, se queda quieto en el primer cuadro.

import { useEffect, useRef } from "react";

export default function VideoVivo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ojo = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => {}); // el navegador puede negarlo: queda el primer cuadro
        else v.pause();
      },
      { threshold: 0.5 },
    );
    ojo.observe(v);
    return () => {
      ojo.disconnect();
      v.pause();
    };
  }, [src]);
  return <video ref={ref} src={src} muted loop playsInline preload="metadata" />;
}
