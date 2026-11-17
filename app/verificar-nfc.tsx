"use client";

import { useEffect, useState } from "react";
import { Nfc } from "lucide-react";
import { CONSULTA_GOOGLE_PAY, mostrarVerificarNfc, revisionNfc, revisionPagoSinContacto, type Revision } from "@/lib/nfc";
import { CheckList } from "./setup-wizard";

type LectorNfc = { scan: (o: { signal: AbortSignal }) => Promise<void> };

// ¿Se puede leer NFC? Se intenta leer un instante: así el navegador dice si hay NFC, si está encendido y si hay permiso.
async function probarNfc(): Promise<string> {
  const Lector = (window as unknown as { NDEFReader?: new () => LectorNfc }).NDEFReader;
  if (!Lector) return "SinSoporte";
  const corte = new AbortController();
  try {
    await new Lector().scan({ signal: corte.signal });
    return "ok";
  } catch (e) {
    return (e as { name?: string }).name || "error";
  } finally {
    corte.abort(); // solo era una prueba: se deja de leer
  }
}

// ¿Hay billetera para pagar acercando el celular? Solo se pregunta; no se abre ningún cobro.
async function probarPago(): Promise<string> {
  if (typeof PaymentRequest === "undefined") return "SinSoporte";
  try {
    const pedido = new PaymentRequest([CONSULTA_GOOGLE_PAY], { total: { label: "Prueba", amount: { currency: "USD", value: "0.00" } } });
    return (await pedido.canMakePayment()) ? "si" : "no";
  } catch {
    return "error";
  }
}

// Tarjeta de Ajustes: revisa si este celular tiene NFC y pago sin contacto.
// Solo aparece en celulares y tabletas con NFC para páginas; en los demás equipos no se muestra.
export default function VerificarNfc() {
  const [revisando, setRevisando] = useState(false);
  const [resultado, setResultado] = useState<Revision[] | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    setVisible(
      mostrarVerificarNfc({
        tieneNfc: "NDEFReader" in window,
        agente: nav.userAgent,
        movil: nav.userAgentData?.mobile,
        puntosTactiles: nav.maxTouchPoints,
      }),
    );
  }, []);

  async function verificar() {
    setRevisando(true);
    setResultado(null);
    try {
      const nfc = await probarNfc();
      const pago = await probarPago();
      setResultado([revisionNfc(nfc), revisionPagoSinContacto(pago)]);
    } finally {
      setRevisando(false);
    }
  }

  if (!visible) return null;
  return (
    <section className="card">
      <h2>NFC y pago sin contacto</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Revisa si este celular puede leer tarjetas NFC y pagar acercándolo. Al verificar, el navegador puede pedirte permiso para usar el NFC.
      </p>
      <div className="actions">
        <button className="btn" disabled={revisando} onClick={() => void verificar()}>
          <Nfc size={18} aria-hidden /> {revisando ? "Verificando…" : "Verificar este celular"}
        </button>
      </div>
      {resultado && <CheckList checks={resultado} />}
      {resultado && (
        <p className="hint">
          Para cobrar con tarjeta acercándola al teléfono («Tap to Pay») se necesita una app de cobro instalada, como Cash App o la de tu banco: una página web no puede revisarlo.
        </p>
      )}
    </section>
  );
}
