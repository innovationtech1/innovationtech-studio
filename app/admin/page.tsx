"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CUENTAS_ON, useCuenta } from "../account-context";
import type { FilaNegocio } from "@/lib/admin-api";
import type { MovimientoPaquete, PagoManual } from "@/lib/account-store";
import { DEFAULT_CONFIG, diaChicago, type Contador, type Negocio, type PaqueteId, type Saldo } from "@/lib/plans";

// Panel mínimo del administrador: activar planes pagados a mano, pausar y reactivar negocios.
// El permiso se vuelve a revisar en el servidor en cada /api/admin/*; aquí solo se oculta la pantalla.

const ESTADOS: Record<string, string> = { prueba: "Prueba", activo: "Activo", pausado: "En pausa", sin_plan: "Sin plan" };
const PLANES: Record<string, string> = { basico: "Básico", pro: "Pro", prueba: "Prueba" };
const METODOS: Record<PagoManual["metodo"], string> = { efectivo: "Efectivo", zelle: "Zelle", cashapp: "Cash App", otro: "Otro" };
const PRECIOS = { basico: 19, pro: 39 };

const fechaCorta = (ms: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", day: "numeric", month: "short", year: "numeric" }).format(ms);

// «8 de diciembre» (sin año), para las notas de pasar a pago a mano
const fechaDia = (ms: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", day: "numeric", month: "long" }).format(ms);

// Hoy (o la fecha dada) + 1 mes (AAAA-MM-DD, hora de Chicago). Si el mes siguiente es más corto, queda su último día.
function dentroDeUnMes(desde = Date.now()): string {
  const [y, m, d] = diaChicago(desde).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // último día del mes siguiente
  const f = new Date(Date.UTC(y, m, Math.min(d, ultimo)));
  return f.toISOString().slice(0, 10);
}

const origenTexto = (f: FilaNegocio) => (f.negocio.origen === "stripe" ? "Tarjeta" : f.negocio.origen === "manual" ? "A mano" : "—");
const venceTexto = (f: FilaNegocio) =>
  f.negocio.origen === "manual" && f.negocio.pagadoHasta !== undefined ? fechaCorta(f.negocio.pagadoHasta) : "—";
const usoTexto = (u: FilaNegocio["usoMes"]) =>
  `${u.textos} textos · ${u.imagenes} imágenes · ${u.voces} voces · ${u.subtitulos} subtítulos · ${u.tomas_ia ?? 0} tomas con IA`;

const CONTADORES: [Contador, string][] = [
  ["textos", "textos"],
  ["imagenes", "imágenes"],
  ["voces", "voces"],
  ["subtitulos", "subtítulos"],
  ["tomas_ia", "tomas con IA"],
];
const PAQUETES: Record<PaqueteId, string> = { creativo: "Creativo", voz: "Voz", video: "Video" };
// «500 textos · 150 imágenes» (solo lo que tiene); con signo para el historial: «+500 textos, +150 imágenes»
const saldoTexto = (s: Saldo, signo = "") => {
  const partes = CONTADORES.filter(([c]) => (s[c] ?? 0) > 0).map(([c, n]) => `${signo}${s[c]} ${n}`);
  return partes.length ? partes.join(signo ? ", " : " · ") : "—";
};

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
            <span>Origen</span><span>Vence</span><span>Uso del mes</span><span>Paquetes</span><span />
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
    const paquetes = r.datos.paquetes as { creativo?: string; voz?: string } | undefined;
    if (r.ok && precios) {
      setResultado({ ok: true, texto: `Stripe listo. Básico: ${precios.basico} · Pro: ${precios.pro}${paquetes ? ` · Creativo: ${paquetes.creativo} · Voz: ${paquetes.voz}` : ""}` });
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
  const [abierto, setAbierto] = useState<"" | "activar" | "a_mano" | "quitar_pendiente" | "paquete" | "quitar" | "historial">("");
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

  const alternar = (que: Exclude<typeof abierto, "">) => setAbierto(abierto === que ? "" : que);
  // Paga con tarjeta al día y todavía no tiene un pago a mano pendiente: se puede pasar a pago a mano
  const puedePasarAMano = negocio.origen === "stripe" && negocio.stripe?.status === "active" && !negocio.manualSiguiente;

  return (
    <section className="adm-fila">
      <strong className="adm-nombre" data-et="Negocio">{negocio.nombre}</strong>
      <span data-et="Dueño" className="adm-dueno">{fila.dueno || "—"}</span>
      <span data-et="Plan">{efectivo.plan ? PLANES[efectivo.plan] : "—"}</span>
      <span data-et="Estado"><em className={`adm-estado ${efectivo.estado}`}>{ESTADOS[efectivo.estado]}</em></span>
      <span data-et="Origen">{origenTexto(fila)}</span>
      <span data-et="Vence">{venceTexto(fila)}</span>
      <span data-et="Uso del mes">{usoTexto(fila.usoMes)}</span>
      <span data-et="Paquetes">{saldoTexto(fila.saldo)}</span>
      <div className="adm-acciones">
        <button className="btn small" disabled={ocupado} onClick={() => alternar("activar")}>Activar plan</button>
        {puedePasarAMano && (
          <button className="btn small ghost" disabled={ocupado} onClick={() => alternar("a_mano")}>Pasar a pago a mano</button>
        )}
        {negocio.manualSiguiente && (
          <button className="btn small ghost" disabled={ocupado} onClick={() => alternar("quitar_pendiente")}>
            Quitar pago a mano pendiente
          </button>
        )}
        <button className="btn small ghost" disabled={ocupado} onClick={() => void accion({ accion: "pausar" })}>Pausar</button>
        <button className="btn small ghost" disabled={ocupado} onClick={() => void accion({ accion: "reactivar" })}>Reactivar</button>
        <button className="btn small ghost" disabled={ocupado} onClick={() => alternar("paquete")}>Agregar paquete</button>
        <button className="btn small ghost" disabled={ocupado} onClick={() => alternar("quitar")}>Quitar saldo</button>
        <button className="btn small ghost" disabled={ocupado} onClick={() => alternar("historial")}>Historial</button>
      </div>
      {negocio.origen === "stripe" && (
        <p className="muted adm-ancho">Si paga con tarjeta, pausa o cancela en Stripe; el siguiente aviso de Stripe puede reactivarlo.</p>
      )}
      {negocio.manualSiguiente && (
        <p className="muted adm-ancho">
          {fila.finTarjeta !== undefined
            ? `Pasa a pago a mano el ${fechaDia(fila.finTarjeta)} (hasta ${fechaDia(negocio.manualSiguiente.hasta)})`
            : `Pasa a pago a mano al terminar el mes con tarjeta (hasta ${fechaDia(negocio.manualSiguiente.hasta)})`}
        </p>
      )}
      {negocio.stripe?.renovoConManual && (
        <p className="adm-error adm-ancho" role="alert">Revisar: esta suscripción volvió a renovar con un pago a mano pendiente</p>
      )}
      {error && <p className="adm-error adm-ancho" role="alert">{error}</p>}
      {abierto === "quitar_pendiente" && negocio.manualSiguiente && (
        // Pregunta dentro de la página (sin window.confirm); los errores salen arriba, en `error`
        <div className="adm-form adm-ancho" role="alertdialog" aria-label="Quitar pago a mano pendiente">
          <p className="adm-ancho">
            ¿Quitar el pago a mano pendiente? La suscripción con tarjeta no cambia: si sigue cancelada, la cuenta se pausará al terminar el mes.
          </p>
          <div className="adm-acciones">
            <button
              className="btn small"
              disabled={ocupado}
              onClick={async () => {
                if (await accion({ accion: "quitar_manual_pendiente" })) setAbierto("");
              }}
            >
              {ocupado ? "Quitando…" : "Sí, quitar"}
            </button>
            <button className="btn small ghost" disabled={ocupado} onClick={() => setAbierto("")} autoFocus>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {abierto === "a_mano" && (
        <FormActivar
          titulo="Pasar a pago a mano"
          ayuda={negocio.stripe?.finPeriodo !== undefined ? `El mes con tarjeta termina el ${fechaDia(negocio.stripe.finPeriodo)}` : undefined}
          planInicial={negocio.plan === "pro" ? "pro" : "basico"}
          fechaInicial={negocio.stripe?.finPeriodo !== undefined ? dentroDeUnMes(negocio.stripe.finPeriodo) : undefined}
          boton="Guardar pago a mano"
          ocupado={ocupado}
          onCancelar={() => setAbierto("")}
          onEnviar={async (c) => {
            if (await accion({ accion: "pasar_a_manual", ...c })) setAbierto("");
          }}
        />
      )}
      {abierto === "activar" && (
        <FormActivar
          ocupado={ocupado}
          onCancelar={() => setAbierto("")}
          onEnviar={async (c) => {
            if (await accion({ accion: "activar", ...c })) setAbierto("");
          }}
        />
      )}
      {abierto === "paquete" && (
        <FormPaquete
          plan={negocio.plan}
          ocupado={ocupado}
          onCancelar={() => setAbierto("")}
          onEnviar={async (c) => {
            if (await accion({ accion: "paquete", ...c })) setAbierto("");
          }}
        />
      )}
      {abierto === "quitar" && (
        <FormQuitar
          saldo={fila.saldo}
          ocupado={ocupado}
          onCancelar={() => setAbierto("")}
          onEnviar={async (c) => {
            if (await accion({ accion: "quitar_saldo", ...c })) setAbierto("");
          }}
        />
      )}
      {abierto === "historial" && <Historial negocioId={negocio.id} />}
    </section>
  );
}

// Pago a mano: «Activar plan» (ahora mismo) o «Pasar a pago a mano» (cuando termina el mes con tarjeta).
// Los dos piden lo mismo: plan, hasta cuándo pagó, monto, forma de pago y nota.
function FormActivar({
  titulo,
  ayuda,
  planInicial = "basico",
  fechaInicial,
  boton = "Guardar pago y activar",
  ocupado,
  onCancelar,
  onEnviar,
}: {
  titulo?: string;
  ayuda?: string;
  planInicial?: "basico" | "pro";
  fechaInicial?: string; // AAAA-MM-DD; si falta, dentro de un mes
  boton?: string;
  ocupado: boolean;
  onCancelar: () => void;
  onEnviar: (c: Record<string, unknown>) => Promise<void>;
}) {
  const [plan, setPlan] = useState<"basico" | "pro">(planInicial);
  const [fecha, setFecha] = useState(() => fechaInicial ?? dentroDeUnMes());
  const [monto, setMonto] = useState(String(PRECIOS[planInicial]));
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
      {titulo && <strong className="adm-ancho">{titulo}</strong>}
      {ayuda && <p className="muted adm-ancho">{ayuda}</p>}
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
        <button className="btn small" type="submit" disabled={ocupado}>{boton}</button>
        <button className="btn small ghost" type="button" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

// Suma a mano un paquete pagado en efectivo, Zelle, Cash App u otro (queda en el Historial).
// Solo se pueden elegir los paquetes del plan guardado del negocio (el servidor también lo revisa).
const PAQUETE_TEXTO: Record<PaqueteId, string> = { creativo: "Creativo (textos e imágenes)", voz: "Voz (voces y subtítulos)", video: "Video (tomas con IA)" };
const paquetesDelPlan = (plan: Negocio["plan"]) =>
  (Object.keys(PAQUETE_TEXTO) as PaqueteId[]).filter((p) => !!plan && DEFAULT_CONFIG.paquetes[p].planes.includes(plan));

function FormPaquete({
  plan,
  ocupado,
  onCancelar,
  onEnviar,
}: {
  plan: Negocio["plan"];
  ocupado: boolean;
  onCancelar: () => void;
  onEnviar: (c: Record<string, unknown>) => Promise<void>;
}) {
  const permitidos = paquetesDelPlan(plan);
  const [paquete, setPaquete] = useState<PaqueteId | undefined>(permitidos[0]);
  const [metodo, setMetodo] = useState<PagoManual["metodo"]>("efectivo");
  const [nota, setNota] = useState("");

  return (
    <form
      className="adm-form adm-ancho"
      onSubmit={(e) => {
        e.preventDefault();
        if (paquete) void onEnviar({ paquete, metodo, nota });
      }}
    >
      <label>Paquete
        <select value={paquete ?? ""} onChange={(e) => setPaquete(e.target.value as PaqueteId)} disabled={permitidos.length === 0}>
          {(Object.keys(PAQUETE_TEXTO) as PaqueteId[]).map((p) => (
            <option key={p} value={p} disabled={!permitidos.includes(p)}>
              {PAQUETE_TEXTO[p]}{permitidos.includes(p) ? "" : " (no es de su plan)"}
            </option>
          ))}
        </select>
      </label>
      {permitidos.length === 0 && (
        <p className="muted adm-ancho">Este negocio no tiene un plan pagado guardado. Activa un plan primero.</p>
      )}
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
        <button className="btn small" type="submit" disabled={ocupado || !paquete}>Agregar paquete</button>
        <button className="btn small ghost" type="button" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

// Resta saldo de paquetes (reembolso o error). El servidor nunca lo deja por debajo de 0.
function FormQuitar({
  saldo,
  ocupado,
  onCancelar,
  onEnviar,
}: {
  saldo: Saldo;
  ocupado: boolean;
  onCancelar: () => void;
  onEnviar: (c: Record<string, unknown>) => Promise<void>;
}) {
  const [cantidades, setCantidades] = useState<Record<Contador, string>>({ textos: "", imagenes: "", voces: "", subtitulos: "", tomas_ia: "" });
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="adm-form adm-ancho"
      onSubmit={(e) => {
        e.preventDefault();
        // Solo se mandan los contadores con un número mayor que 0
        const pedido: Saldo = {};
        for (const [c] of CONTADORES) {
          const v = cantidades[c].trim();
          if (v === "") continue;
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0) {
            setError("Escribe números enteros (0 o más).");
            return;
          }
          if (n > 0) pedido[c] = n;
        }
        if (Object.keys(pedido).length === 0) {
          setError("Escribe cuánto quitar en al menos un contador.");
          return;
        }
        setError("");
        void onEnviar({ cantidades: pedido, nota });
      }}
    >
      <p className="muted adm-ancho">Saldo actual: {saldoTexto(saldo)}</p>
      {CONTADORES.map(([c, nombre]) => (
        <label key={c}>Quitar {nombre}
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={cantidades[c]}
            onChange={(e) => setCantidades({ ...cantidades, [c]: e.target.value })}
            placeholder="0"
          />
        </label>
      ))}
      <label className="adm-nota">Nota
        <input type="text" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional (p. ej. reembolso)" />
      </label>
      {error && <p className="adm-error adm-ancho" role="alert">{error}</p>}
      <div className="adm-acciones">
        <button className="btn small" type="submit" disabled={ocupado}>Quitar saldo</button>
        <button className="btn small ghost" type="button" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

// Pagos a mano y movimientos de paquetes, juntos y del más nuevo al más viejo.
type Renglon = { id: string; fecha: number; texto: string; por: string };
const renglonPago = (p: PagoManual): Renglon => ({
  id: `pago-${p.id}`,
  fecha: p.fecha,
  texto: `${fechaCorta(p.fecha)} · ${PLANES[p.plan]} · $${p.monto} · ${METODOS[p.metodo]} · hasta ${fechaCorta(p.hasta)}${p.nota ? ` · ${p.nota}` : ""}`,
  por: p.registradoPor,
});
const renglonMovimiento = (m: MovimientoPaquete): Renglon => {
  const que =
    m.tipo === "agregar"
      ? `Paquete ${m.paquete ? PAQUETES[m.paquete] : ""} agregado · ${saldoTexto(m.cantidades, "+")}`
      : `Saldo quitado · ${saldoTexto(m.cantidades, "−")}`;
  return {
    id: `mov-${m.id}`,
    fecha: m.fecha,
    texto: `${fechaCorta(m.fecha)} · ${que}${m.metodo ? ` · ${METODOS[m.metodo]}` : ""}${m.nota ? ` · ${m.nota}` : ""}`,
    por: m.registradoPor,
  };
};

function Historial({ negocioId }: { negocioId: string }) {
  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    void pedir(`/api/admin/negocios/${encodeURIComponent(negocioId)}`, { cache: "no-store" }).then((r) => {
      if (!vivo) return;
      if (r.ok) {
        const pagos = ((r.datos.pagos as PagoManual[] | undefined) ?? []).map(renglonPago);
        const movimientos = ((r.datos.movimientos as MovimientoPaquete[] | undefined) ?? []).map(renglonMovimiento);
        setRenglones([...pagos, ...movimientos].sort((a, b) => b.fecha - a.fecha));
      } else setError(String(r.datos.error ?? "No pudimos cargar el historial."));
    });
    return () => {
      vivo = false;
    };
  }, [negocioId]);

  return (
    <div className="adm-historial adm-ancho">
      {error && <p className="adm-error" role="alert">{error}</p>}
      {!renglones && !error && <p>Cargando historial…</p>}
      {renglones && renglones.length === 0 && <p>Todavía no hay pagos a mano ni paquetes.</p>}
      {renglones && renglones.length > 0 && (
        <ul>
          {renglones.map((x) => (
            <li key={x.id}>
              {x.texto} <small>({x.por})</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
