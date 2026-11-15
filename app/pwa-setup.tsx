"use client";

import { Share } from "lucide-react";
import { useEffect, useState } from "react";

// Registra el service worker y muestra un botón para instalar la app:
// - Android, Windows, Mac y Linux (Chrome / Edge): instalación con un clic.
// - iPhone y iPad (Safari): instrucciones para "Agregar a pantalla de inicio".

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pedida, setPedida] = useState(false); // la persona tocó «Instalar la app» en el pie de la página

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setIsIos(ios);

    try {
      setDismissed(localStorage.getItem("its-install-dismissed") === "1");
    } catch {
      /* nada */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    // «Instalar la app» (pie de la página): la barra vuelve aunque se haya cerrado antes
    const onPedida = () => {
      setPedida(true);
      setDismissed(false);
      if (ios) setShowIosHelp(true);
    };
    window.addEventListener("its-instalar", onPedida);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("its-instalar", onPedida);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Ya instalada y la pidieron: se dice, en vez de no hacer nada
  if (installed) {
    if (!pedida) return null;
    return (
      <div className="install-bar" role="status">
        <img src="/icons/favicon-48.png" alt="" width={36} height={36} />
        <div className="install-text">
          <strong>Ya la tienes instalada</strong>
          <span>Estás usando InnovationTECH Studio como app.</span>
        </div>
        <button className="install-close" aria-label="Cerrar" onClick={() => setPedida(false)}>
          ×
        </button>
      </div>
    );
  }
  if (dismissed || (!installEvent && !isIos && !pedida)) return null;
  // Navegador sin instalación con un clic (o ya se usó): se explica cómo hacerlo desde el menú
  const manual = !installEvent && !isIos;

  const dismiss = () => {
    setDismissed(true);
    setPedida(false);
    try {
      localStorage.setItem("its-install-dismissed", "1");
    } catch {
      /* nada */
    }
  };

  return (
    <div className="install-bar" role="dialog" aria-label="Instalar la app">
      <img src="/icons/favicon-48.png" alt="" width={36} height={36} />
      <div className="install-text">
        <strong>Instala InnovationTECH Studio</strong>
        {showIosHelp ? (
          <span>
            Toca <b>Compartir</b> <Share size={15} aria-hidden style={{ verticalAlign: "-2px" }} /> en Safari y luego <b>Agregar a pantalla de inicio</b>.
          </span>
        ) : (
          <span>{manual ? "Abre el menú de tu navegador (⋮) y elige «Instalar aplicación» o «Agregar a pantalla de inicio»." : "Ábrela como app desde tu pantalla de inicio o escritorio."}</span>
        )}
      </div>
      {installEvent ? (
        <button
          className="btn small"
          onClick={async () => {
            await installEvent.prompt();
            await installEvent.userChoice.catch(() => null);
            setInstallEvent(null);
          }}
        >
          Instalar
        </button>
      ) : (
        !showIosHelp && !manual && (
          <button className="btn small" onClick={() => setShowIosHelp(true)}>
            ¿Cómo?
          </button>
        )
      )}
      <button className="install-close" aria-label="Cerrar" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
