"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Keyboard, Nfc, QrCode, X } from "lucide-react";
import { startDomTranslation } from "@/lib/i18n";
import { CASHTAG_INNOVATIONTECH, LARGO_CODIGO, codigoDe, enlaceCashApp, enlaceWhatsAppActivacion, limpiarCodigo, mostrarCodigo } from "@/lib/activacion";
import { revisionNfc } from "@/lib/nfc";
import { usarCamara } from "../usar-camara";
import { CamaraNoAbre } from "../camara-ayuda";

type RegistroNfc = { recordType: string; data?: DataView; encoding?: string };
type LectorNfc = {
  scan: (o: { signal: AbortSignal }) => Promise<void>;
  onreading: ((e: { message: { records: RegistroNfc[] } }) => void) | null;
  onreadingerror: (() => void) | null;
};
type DetectorQr = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const CASHTAG = process.env.NEXT_PUBLIC_CASHAPP_TAG || CASHTAG_INNOVATIONTECH;
const CASH_APP = enlaceCashApp(CASHTAG);

// Lo que trae cada registro del chip (enlace o texto)
function textoDe(r: RegistroNfc): string {
  if (!r.data) return "";
  try {
    return new TextDecoder(r.encoding || "utf-8").decode(r.data);
  } catch {
    return "";
  }
}

// Cámara que busca el código QR de la tarjeta. Entrega lo leído con onLeido.
function EscanerQr({ onLeido, onCerrar }: { onLeido: (texto: string) => void; onCerrar: () => void }) {
  const cam = usarCamara({ sonido: false, ancho: 1280, alto: 720 });
  const { video, listo, error } = cam;
  const [sinLector, setSinLector] = useState(false);
  useEffect(() => {
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => DetectorQr }).BarcodeDetector;
    if (!Detector) return setSinLector(true);
    if (!listo) return;
    const detector = new Detector({ formats: ["qr_code"] });
    let ocupado = false;
    const reloj = setInterval(async () => {
      const v = video.current;
      if (ocupado || !v || !v.videoWidth) return;
      ocupado = true;
      try {
        const hallados = await detector.detect(v);
        if (hallados[0]?.rawValue) onLeido(hallados[0].rawValue);
      } catch {
        /* se intenta otra vez en el siguiente cuadro */
      } finally {
        ocupado = false;
      }
    }, 300);
    return () => clearInterval(reloj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  return (
    <div className="welcome-backdrop acct-capa" role="dialog" aria-modal="true" aria-label="Escanear código QR">
      <div className="acct-caja camara-caja">
        <button className="acct-cerrar" onClick={onCerrar} title="Cerrar">
          <X size={20} aria-hidden />
        </button>
        <h2>Escanear código QR</h2>
        {sinLector ? (
          <p className="hint">Este navegador no puede leer códigos QR desde la página. Escribe el código que viene impreso en la tarjeta.</p>
        ) : error ? (
          <CamaraNoAbre error={error} detectadas={cam.lista.length} onReintentar={cam.reintentar} />
        ) : (
          <>
            <div className="camara-vista">
              <video ref={video} playsInline muted />
              {!listo && <span className="muted">Abriendo la cámara…</span>}
            </div>
            <p className="hint">Apunta la cámara al código QR de la tarjeta.</p>
          </>
        )}
        <div className="actions camara-botones">
          <button className="btn ghost" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Pantalla «Activar con tarjeta»: leer la tarjeta (NFC, QR o código), pagar con Cash App y pedir la activación.
export default function ActivarTarjeta() {
  const [codigo, setCodigo] = useState("");
  const [escrito, setEscrito] = useState("");
  const [aviso, setAviso] = useState("");
  const [hayNfc, setHayNfc] = useState(false);
  const [leyendoNfc, setLeyendoNfc] = useState(false);
  const [qrAbierto, setQrAbierto] = useState(false);
  const corteNfc = useRef<AbortController | null>(null);

  useEffect(() => {
    setHayNfc("NDEFReader" in window);
    // La tarjeta abre esta página con su código en el enlace (?c=...)
    const delEnlace = codigoDe(window.location.href);
    if (delEnlace) setCodigo(delEnlace);
    const parar = startDomTranslation();
    return () => {
      corteNfc.current?.abort();
      parar?.();
    };
  }, []);

  // Lo leído de la tarjeta (chip, QR o escrito): si trae un código, queda listo
  function recibir(leido: string): boolean {
    const c = codigoDe(leido);
    if (!c) {
      setAviso("Esa no parece una tarjeta de InnovationTECH Studio. Revisa el código e intenta de nuevo.");
      return false;
    }
    setCodigo(c);
    setAviso("");
    return true;
  }

  async function leerNfc() {
    const Lector = (window as unknown as { NDEFReader?: new () => LectorNfc }).NDEFReader;
    if (!Lector) return;
    corteNfc.current?.abort();
    const corte = new AbortController();
    corteNfc.current = corte;
    setAviso("");
    try {
      const lector = new Lector();
      lector.onreading = (e) => {
        const leido = e.message.records.map(textoDe).find((t) => codigoDe(t)) ?? e.message.records.map(textoDe)[0] ?? "";
        if (recibir(leido)) {
          corte.abort();
          setLeyendoNfc(false);
        }
      };
      lector.onreadingerror = () => setAviso("No se pudo leer la tarjeta. Acércala otra vez a la parte de atrás del celular.");
      await lector.scan({ signal: corte.signal });
      setLeyendoNfc(true);
    } catch (e) {
      setLeyendoNfc(false);
      const r = revisionNfc((e as { name?: string }).name || "error");
      setAviso(`${r.label}. ${r.help ?? ""}`.trim());
    }
  }

  function dejarDeLeer() {
    corteNfc.current?.abort();
    setLeyendoNfc(false);
  }

  function otraTarjeta() {
    setCodigo("");
    setEscrito("");
    setAviso("");
  }

  return (
    <main className="legal activar">
      <a className="acct-link legal-volver" href="/">
        ← Volver a Studio
      </a>
      <h1>Activar con tarjeta</h1>
      <p className="hint">Activa InnovationTECH Studio con la tarjeta que viene en tu paquete. Son tres pasos.</p>

      <section className="card">
        <h2>1. Lee tu tarjeta</h2>
        {codigo ? (
          <>
            <p className="activar-codigo">
              <CircleCheck size={22} aria-hidden /> Código de tu tarjeta: <strong data-no-translate>{mostrarCodigo(codigo)}</strong>
            </p>
            <button className="btn ghost small" onClick={otraTarjeta}>
              Usar otra tarjeta
            </button>
          </>
        ) : (
          <>
            <p className="hint">Elige la forma que te quede más fácil.</p>
            <div className="activar-opciones">
              {hayNfc &&
                (leyendoNfc ? (
                  <button className="btn" onClick={dejarDeLeer}>
                    <Nfc size={18} aria-hidden /> Dejar de leer
                  </button>
                ) : (
                  <button className="btn" onClick={() => void leerNfc()}>
                    <Nfc size={18} aria-hidden /> Activar NFC
                  </button>
                ))}
              <button className={hayNfc ? "btn ghost" : "btn"} onClick={() => (dejarDeLeer(), setQrAbierto(true))}>
                <QrCode size={18} aria-hidden /> Escanear QR
              </button>
            </div>
            {leyendoNfc && <p className="ok">Acerca la tarjeta a la parte de atrás del celular…</p>}
            <label htmlFor="activar-codigo">
              <Keyboard size={16} aria-hidden /> O escribe el código de la tarjeta
            </label>
            <div className="activar-escribir">
              <input
                id="activar-codigo"
                value={escrito}
                onChange={(e) => setEscrito(mostrarCodigo(limpiarCodigo(e.target.value).slice(0, LARGO_CODIGO)))}
                placeholder="ABCD-2345"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                data-no-translate
              />
              <button className="btn" disabled={limpiarCodigo(escrito).length < LARGO_CODIGO} onClick={() => recibir(escrito)}>
                Usar código
              </button>
            </div>
          </>
        )}
        {aviso && <div className="error">{aviso}</div>}
      </section>

      <section className="card">
        <h2>2. Paga con Cash App</h2>
        <p className="hint">Paga el plan que viene con tu tarjeta. Si ya pagaste, pasa al paso 3.</p>
        {CASH_APP ? (
          <>
            <a className="btn" href={CASH_APP} target="_blank" rel="noreferrer">
              Pagar con Cash App
            </a>
            <p className="hint activar-cashtag">
              Se paga a <strong data-no-translate>${CASHTAG.replace(/^\$/, "")}</strong> (InnovationTECH).
            </p>
          </>
        ) : (
          <p className="hint">El pago con Cash App se acuerda por WhatsApp con InnovationTECH en el paso 3.</p>
        )}
      </section>

      <section className="card">
        <h2>3. Pide tu activación</h2>
        <p className="hint">Envía tu código a InnovationTECH por WhatsApp. Activamos tu cuenta al confirmar tu pago.</p>
        {codigo ? (
          <a className="btn" href={enlaceWhatsAppActivacion(codigo)} target="_blank" rel="noreferrer">
            Enviar mi código por WhatsApp
          </a>
        ) : (
          <button className="btn" disabled>
            Enviar mi código por WhatsApp
          </button>
        )}
        {!codigo && <p className="hint">Primero lee tu tarjeta en el paso 1.</p>}
      </section>

      {qrAbierto && (
        <EscanerQr
          onLeido={(t) => {
            if (recibir(t)) setQrAbierto(false);
          }}
          onCerrar={() => setQrAbierto(false)}
        />
      )}
    </main>
  );
}
