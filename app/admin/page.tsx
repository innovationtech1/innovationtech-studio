"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CUENTAS_ON, useCuenta } from "../account-context";
import type { FilaNegocio } from "@/lib/admin-api";
import type { PagoManual } from "@/lib/account-store";
import { diaChicago } from "@/lib/plans";

// Panel mínimo del administrador: activar planes pagados a mano, pausar y reactivar negocios.
// El permiso se vuelve a revisar en el servidor en cada /api/admin/*; aquí solo se oculta la pantalla.

const ESTADOS: Record<string, string> = { prueba: "Prueba", activo: "Activo", pausado: "En pausa", sin_plan: "Sin plan" };
const PLANES: Record<string, string> = { basico: "Básico", pro: "Pro", prueba: "Prueba" };
const METODOS: Record<PagoManual["metodo"], string> = { efectivo: "Efectivo", zelle: "Zelle", cashapp: "Cash App", otro: "Otro" };
const PRECIOS = { basico: 19, pro: 39 };

const fechaCorta = (ms: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", day: "numeric", month: "short", year: "numeric" }).format(ms);

// Hoy + 1 mes (AAAA-MM-DD, hora de Chicago). Si el mes siguiente es más corto, queda su último día.
function dentroDeUnMes(): string {
  const [y, m, d] = diaChicago(Date.now()).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // último día del mes siguiente
  const f = new Date(Date.UTC(y, m, Math.min(d, ultimo)));
  return f.toISOString().slice(0, 10);
}

const origenTexto = (f: FilaNegocio) => (f.negocio.origen === "stripe" ? "Tarjeta" : f.negocio.origen === "manual" ? "A mano" : "—");
const venceTexto = (f: FilaNegocio) =>
  f.negocio.origen === "manual" && f.negocio.pagadoHasta !== undefined ? fechaCorta(f.negocio.pagadoHasta) : "—";
const usoTexto = (u: FilaNegocio["usoMes"]) =>
  `${u.textos} textos · ${u.imagenes} imágenes · ${u.voces} voces · ${u.subtitulos} subtítulos`;

export default function PaginaAdmin() {
  if (!CUENTAS_ON) {
    return (
      <main className="adm">
        <p>El panel de administrador se activa con las cuentas.</p>
      </main>
    );
  }
  return <Panel />;
}

function Panel() {
  const { cargando, cuenta } = useCuenta();
  if (cargando || !cuenta) {
    return (
      <main className="adm">
        <p>Cargando…</p>
      </main>
    );
  }
  if (!cuenta.esAdmin) {
    return (
      <main className="adm">
        <p>No tienes permiso para ver esta página.</p>
        <a className="btn small ghost" href="/">Volver al inicio</a>
      </main>
    );
  }
  return <Lista />;
}

async function pedir(url: string, init?: RequestInit): Promise<{ ok: boolean; datos: Record<string, unknown> }> {
  try {
    const r = await fetch(url, init);
    const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, datos };
  } catch {
    return { ok: false, datos: { error: "No pudimos conectar. Revisa tu internet e inténtalo otra vez." } };
  }
}

function Lista() {
  const [filas, setFilas] = useState<FilaNegocio[] | null>(null);
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState("");

  const cargar = useCallback(async () => {
    const r = await pedir("/api/admin/negocios", { cache: "no-store" });
    if (r.ok) {
      setFilas(r.datos.negocios as FilaNegocio[]);
      setError("");
    } else {
      setError(String(r.datos.error ?? "No pudimos cargar los negocios."));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!filas) return [];
    return q ? filas.filter((f) => f.negocio.nombre.toLowerCase().includes(q) || f.dueno.toLowerCase().includes(q)) : filas;
  }, [filas, buscar]);

  return (
    <main className="adm">
      <div className="adm-encabezado">
        <h1>Panel de administrador</h1>
        <a className="btn small ghost" href="/">← Volver a Studio</a>
      </div>
      <div className="adm-barra">
        <input
          type="search"
          placeholder="Buscar por negocio o correo del dueño"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          aria-label="Buscar negocio"
        />
        <button className="btn small ghost" onClick={() => void cargar()}>Actualizar</button>
        <PrepararStripe />
      </div>
      {error && <p className="adm-error" role="alert">{error}</p>}
      {!filas && !error && <p>Cargando negocios…</p>}
      {filas && visibles.length === 0 && <p>No hay negocios que mostrar.</p>}

      {visibles.length > 0 && (
        <>
          <div className="adm-cab" aria-hidden>
            <span>Negocio</span><span>Dueño</span><span>Plan</span><span>Estado</span>
            <span>Origen</span><span>Vence</span><span>Uso de hoy</span><span />
          </div>
          {visibles.map((f) => (
            <Fila key={f.negocio.id} fila={f} onCambio={cargar} />
          ))}
        </>
      )}
    </main>
  );
}

// Crea en Stripe los precios de Básico y Pro (si faltan) y guarda sus ids. Se puede pulsar varias veces.
function PrepararStripe() {
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function preparar() {
    setOcupado(true);
    setResultado(null);
    const r = await pedir("/api/admin/stripe", { method: "POST" });
    setOcupado(false);
    const precios = r.datos.precios as { basico?: string; pro?: string } | undefined;
    if (r.ok && precios) {
      setResultado({ ok: true, texto: `Stripe listo. Básico: ${precios.basico} · Pro: ${precios.pro}` });
    } else {
      setResultado({ ok: false, texto: String(r.datos.error ?? "No se pudo preparar Stripe.") });
    }
  }

  return (
    <>
      <button className="btn small" disabled={ocupado} onClick={() => void preparar()}>
        {ocupado ? "Preparando…" : "Preparar Stripe"}
      </button>
      {resultado && (
        <p className={resultado.ok ? "adm-ok" : "adm-error"} role="status" data-no-translate>
          {resultado.texto}
        </p>
      )}
    </>
  );
}

function Fila({ fila, onCambio }: { fila: FilaNegocio; onCambio: () => Promise<void> }) {
  const { negocio, efectivo } = fila;
  const [abierto, setAbierto] = useState<"" | "activar" | "historial">("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function accion(cuerpo: Record<string, unknown>): Promise<boolean> {
    setOcupado(true);
    setError("");
    const r = await pedir(`/api/admin/negocios/${encodeURIComponent(negocio.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    setOcupado(false);
    if (!r.ok) {
      setError(String(r.datos.error ?? "No se pudo hacer el cambio."));
      return false;
    }
    await onCambio();
    return true;
  }

  const alternar = (que: "activar" | "historial") => setAbierto(abierto === que ? "" : que);

  return (
    <section className="adm-fila">
      <strong className="adm-nombre" data-et="Negocio">{negocio.nombre}</strong>
      <span data-et="Dueño" className="adm-dueno">{fila.dueno || "—"}</span>
      <span data-et="Plan">{efectivo.plan ? PLANES[efectivo.plan] : "—"}</span>
      <span data-et="Estado"><em className={`adm-estado ${efectivo.estado}`}>{ESTADOS[efectivo.estado]}</em></span>
      <span data-et="Origen">{origenTexto(fila)}</span>
      <span data-et="Vence">{venceTexto(fila)}</span>
      <span data-et="Uso de hoy">{usoTexto(fila.usoMes)}</span>
      <div className="adm-acciones">
        <button className="btn small" disabled={ocupado} onClick={() => alternar("activar")}>Activar plan</button>
        <button className="btn small ghost" disabled={ocupado} onClick={() => void accion({ accion: "pausar" })}>Pausar</button>
        <button className="btn small ghost" disabled={ocupado} onClick={() => void accion({ accion: "reactivar" })}>Reactivar</button>
        <button className="btn small ghost" disabled={ocupado} onClick={() => alternar("historial")}>Historial</button>
      </div>
      {negocio.origen === "stripe" && (
        <p className="muted adm-ancho">Si paga con tarjeta, pausa o cancela en Stripe; el siguiente aviso de Stripe puede reactivarlo.</p>
      )}
      {error && <p className="adm-error adm-ancho" role="alert">{error}</p>}
      {abierto === "activar" && (
        <FormActivar
          ocupado={ocupado}
          onCancelar={() => setAbierto("")}
          onEnviar={async (c) => {
            if (await accion({ accion: "activar", ...c })) setAbierto("");
          }}
        />
      )}
      {abierto === "historial" && <Historial negocioId={negocio.id} />}
    </section>
  );
}

function FormActivar({
  ocupado,
  onCancelar,
  onEnviar,
}: {
  ocupado: boolean;
  onCancelar: () => void;
  onEnviar: (c: Record<string, unknown>) => Promise<void>;
}) {
  const [plan, setPlan] = useState<"basico" | "pro">("basico");
  const [fecha, setFecha] = useState(dentroDeUnMes);
  const [monto, setMonto] = useState(String(PRECIOS.basico));
  const [metodo, setMetodo] = useState<PagoManual["metodo"]>("efectivo");
  const [nota, setNota] = useState("");

  return (
    <form
      className="adm-form adm-ancho"
      onSubmit={(e) => {
        e.preventDefault();
        void onEnviar({ plan, fecha, monto: monto.trim() === "" ? Number.NaN : Number(monto), metodo, nota });
      }}
    >
      <label>Plan
        <select
          value={plan}
          onChange={(e) => {
            const p = e.target.value as "basico" | "pro";
            setPlan(p);
            setMonto(String(PRECIOS[p])); // el monto sigue al precio del plan
          }}
        >
          <option value="basico">Básico</option>
          <option value="pro">Pro</option>
        </select>
      </label>
      <label>Pagado hasta
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      </label>
      <label>Monto (USD)
        <input type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
      </label>
      <label>Forma de pago
        <select value={metodo} onChange={(e) => setMetodo(e.target.value as PagoManual["metodo"])}>
          {Object.entries(METODOS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="adm-nota">Nota
        <input type="text" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
      </label>
      <div className="adm-acciones">
        <button className="btn small" type="submit" disabled={ocupado}>Guardar pago y activar</button>
        <button className="btn small ghost" type="button" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function Historial({ negocioId }: { negocioId: string }) {
  const [pagos, setPagos] = useState<PagoManual[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    void pedir(`/api/admin/negocios/${encodeURIComponent(negocioId)}`, { cache: "no-store" }).then((r) => {
      if (!vivo) return;
      if (r.ok) setPagos(r.datos.pagos as PagoManual[]);
      else setError(String(r.datos.error ?? "No pudimos cargar el historial."));
    });
    return () => {
      vivo = false;
    };
  }, [negocioId]);

  return (
    <div className="adm-historial adm-ancho">
      {error && <p className="adm-error" role="alert">{error}</p>}
      {!pagos && !error && <p>Cargando historial…</p>}
      {pagos && pagos.length === 0 && <p>Todavía no hay pagos a mano.</p>}
      {pagos && pagos.length > 0 && (
        <ul>
          {pagos.map((p) => (
            <li key={p.id}>
              {fechaCorta(p.fecha)} · {PLANES[p.plan]} · ${p.monto} · {METODOS[p.metodo]} · hasta {fechaCorta(p.hasta)}
              {p.nota ? ` · ${p.nota}` : ""} <small>({p.registradoPor})</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
