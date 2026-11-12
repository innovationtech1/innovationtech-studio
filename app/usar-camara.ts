"use client";

import { useEffect, useRef, useState } from "react";
import { camarasDe, esFrontal, mensajeCamara, pedidoDeCamara, siguienteCamara, type CamaraDetectada } from "@/lib/camara";

// Abre la cámara para las dos cámaras de Studio (fotos y video) y detecta cuáles hay.
// Si la cámara pedida no abre, intenta con cualquiera; si el micrófono no abre, sigue sin sonido.
export function usarCamara(o: { sonido: boolean; ancho?: number; alto?: number; pausada?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const [lista, setLista] = useState<CamaraDetectada[]>([]);
  const [elegida, setElegida] = useState(""); // la que pidió la persona ("" = la que el navegador elija)
  const [activa, setActiva] = useState(""); // la que quedó abierta
  const [frente, setFrente] = useState(false);
  const [espejo, setEspejo] = useState(false);
  const [lista2, setIntento] = useState(0); // sube para volver a intentar
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (o.pausada) return;
    let vivo = true;
    setListo(false);
    setError("");
    (async () => {
      const md = navigator.mediaDevices;
      if (!md?.getUserMedia) return setError(mensajeCamara("SinSoporte"));
      const pedida = pedidoDeCamara({ id: elegida || undefined, frente, ancho: o.ancho, alto: o.alto });
      // De lo más preciso a lo más general: la cámara pedida con sonido, sin sonido, y cualquier cámara
      const intentos: { video: unknown; audio: boolean }[] = [{ video: pedida, audio: o.sonido }];
      if (o.sonido) intentos.push({ video: pedida, audio: false });
      intentos.push({ video: true, audio: o.sonido });
      if (o.sonido) intentos.push({ video: true, audio: false });
      let s: MediaStream | null = null;
      let fallo = "";
      let sinSonido = false;
      for (const i of intentos) {
        try {
          s = await md.getUserMedia(i as MediaStreamConstraints);
          sinSonido = o.sonido && !i.audio;
          break;
        } catch (e) {
          fallo = fallo || ((e as { name?: string }).name ?? "");
        }
      }
      const detectadas = camarasDe(await md.enumerateDevices().catch(() => []));
      if (!vivo) return s?.getTracks().forEach((t) => t.stop());
      setLista(detectadas);
      if (!s) {
        // Sin permiso el navegador no dice qué cámaras hay: solo se afirma «ninguna» si de verdad no encontró
        const ninguna = fallo === "NotFoundError" || fallo === "OverconstrainedError";
        return setError(mensajeCamara(ninguna && detectadas.length === 0 ? "SinCamaras" : fallo));
      }
      flujo.current = s;
      const pista = s.getVideoTracks()[0];
      const ajustes = pista?.getSettings?.() ?? {};
      const id = ajustes.deviceId ?? "";
      setActiva(id);
      setEspejo(esFrontal(ajustes.facingMode, detectadas.find((c) => c.id === id)?.nombre ?? pista?.label ?? ""));
      setAviso(sinSonido ? mensajeCamara("SinMicrofono") : "");
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
      setListo(true);
    })();
    return () => {
      vivo = false;
      flujo.current?.getTracks().forEach((t) => t.stop());
      flujo.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegida, frente, lista2, o.pausada]);

  return {
    video,
    flujo,
    lista,
    activa,
    espejo,
    listo,
    error,
    aviso,
    setError,
    // Elegir una cámara de la lista
    elegir: (id: string) => setElegida(id),
    // «Cambiar»: la siguiente de la lista; si el navegador solo reporta una, alterna delantera y trasera
    cambiar: () => {
      const sig = siguienteCamara(lista, activa);
      if (sig) setElegida(sig);
      else {
        setElegida("");
        setFrente((f) => !f);
      }
    },
    // Volver a buscar (después de conectar una cámara o dar el permiso)
    reintentar: () => {
      setElegida("");
      setIntento((n) => n + 1);
    },
  };
}
