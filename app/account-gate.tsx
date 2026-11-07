"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { installAuthFetch } from "@/lib/auth-fetch";
import { mensajeAuth } from "@/lib/auth-mensajes";
import { ContextoCuenta, registrarRefresco, type Cuenta, type ValorCuenta } from "./account-context";
import {
  abrirPortal,
  Bienvenida,
  Cargando,
  CrearNegocio,
  ElegirPlan,
  ErrorCarga,
  MiCuenta,
  PagoPendiente,
  type FB,
} from "./account-screens";
import TrialBanner, { PausaBanner } from "./trial-banner";

// Puerta de las cuentas: solo se usa con NEXT_PUBLIC_STUDIO_CUENTAS=on (ver app/layout.tsx).
// Carga Firebase, pide la cuenta a /api/cuenta y muestra la pantalla que toca según su estado.

type Sesion = "cargando" | "fuera" | "dentro";
type Aviso = { texto: string; pro?: boolean };

const CADA = 60_000; // se vuelve a leer la cuenta cada minuto

export default function AccountGate({ children }: { children: React.ReactNode }) {
  const [fb, setFb] = useState<FB | null>(null);
  const [sesion, setSesion] = useState<Sesion>("cargando");
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [errorEntrada, setErrorEntrada] = useState("");
  const [modal, setModal] = useState<null | "cuenta" | "planes" | "pago">(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [pagando, setPagando] = useState(false);
  const [mensajePago, setMensajePago] = useState<string | undefined>(undefined);
  const pathname = usePathname();

  // Cada cambio de sesión invalida las respuestas que vengan en camino de la sesión anterior
  const generacion = useRef(0);
  const dentro = useRef(false);
  const tieneCuenta = useRef(false);

  const refrescar = useCallback(async () => {
    if (!dentro.current) return;
    const gen = generacion.current;
    try {
      const r = await fetch("/api/cuenta", { cache: "no-store" });
      if (gen !== generacion.current) return;
      if (!r.ok) throw new Error(String(r.status));
      const c = (await r.json()) as Cuenta;
      if (gen !== generacion.current) return;
      tieneCuenta.current = true;
      setCuenta(c);
      setErrorCarga("");
    } catch {
      // Si ya había cuenta, se queda la que estaba; si no, se muestra el error con «Intentar de nuevo»
      if (gen === generacion.current && !tieneCuenta.current) {
        setErrorCarga("No pudimos cargar tu cuenta. Revisa tu conexión e intenta de nuevo.");
      }
    }
  }, []);

  useEffect(() => registrarRefresco(refrescar), [refrescar]);

  // Errores de las rutas de IA: algunos cambian lo que se debe mostrar
  const alCodigo = useRef((codigo: string) => {});
  alCodigo.current = (codigo: string) => {
    if (codigo === "PAUSADO" || codigo === "SIN_PLAN" || codigo === "LIMITE") void refrescar();
    if (codigo === "PLAN") setAviso({ texto: "Esta herramienta es del plan Pro.", pro: true });
  };

  // 1) Carga Firebase (solo aquí, nunca con las cuentas apagadas) y pone el token en cada llamada a /api
  useEffect(() => {
    let vivo = true;
    let dejar = () => {};
    let deshacer = () => {};
    import("@/lib/firebase-client")
      .then((m) => {
        if (!vivo) return;
        deshacer = installAuthFetch((forzar) => m.tokenActual(forzar), {
          onCodigo: (codigo) => alCodigo.current(codigo),
        });
        setFb(m);
        // Al volver de Google con redirección (iPhone o ventana bloqueada)
        m.resultadoRedireccion().catch((e) => setErrorEntrada(mensajeAuth(e)));
        dejar = m.alCambiarSesion((u) => {
          generacion.current += 1;
          dentro.current = !!u;
          tieneCuenta.current = false;
          setCuenta(null);
          setErrorCarga("");
          setModal(null);
          setSesion(u ? "dentro" : "fuera");
          if (u) void refrescar();
        });
      })
      .catch(() => {
        if (vivo) setErrorCarga("No se pudo cargar el inicio de sesión. Revisa tu conexión e intenta de nuevo.");
      });
    return () => {
      vivo = false;
      dejar();
      deshacer();
    };
  }, [refrescar]);

  // 2) Se vuelve a leer la cuenta cada minuto y al regresar a la pestaña
  useEffect(() => {
    if (sesion !== "dentro") return;
    const id = setInterval(() => void refrescar(), CADA);
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sesion, refrescar]);

  // 3) Regreso de Stripe: ?pago=ok o ?pago=cancelado
  useEffect(() => {
    const url = new URL(window.location.href);
    const pago = url.searchParams.get("pago");
    if (!pago) return;
    url.searchParams.delete("pago");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (pago === "ok") {
      setAviso({ texto: "¡Listo! Tu plan está activo." });
      void refrescar();
      // El aviso de Stripe puede tardar unos segundos en llegar al servidor
      const t = setTimeout(() => void refrescar(), 3000);
      return () => clearTimeout(t);
    }
    if (pago === "cancelado") setAviso({ texto: "El pago se canceló. Puedes intentarlo cuando quieras." });
  }, [refrescar]);

  // Los avisos se quitan solos
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.pro ? 10_000 : 6_000);
    return () => clearTimeout(t);
  }, [aviso]);

  const valor: ValorCuenta = useMemo(
    () => ({
      activo: true,
      cargando: sesion === "cargando" || (sesion === "dentro" && !cuenta),
      cuenta,
      refrescar,
      abrirMiCuenta: () => setModal("cuenta"),
      abrirPlanes: () => setModal("planes"),
    }),
    [sesion, cuenta, refrescar],
  );

  const salir = () => void fb?.salir();

  async function pagarReactivar() {
    // Sin suscripción de tarjeta que se pueda pagar (cancelada o pago a mano): elegir plan de nuevo
    const st = cuenta?.usuario ? cuenta.negocio.stripe : undefined;
    const conTarjeta =
      cuenta?.usuario && cuenta.negocio.origen === "stripe" && st?.subscriptionId && st.status !== "canceled" && st.status !== "incomplete_expired";
    if (!conTarjeta) {
      setModal("planes");
      return;
    }
    setPagando(true);
    const fue = await abrirPortal();
    if (fue !== true) {
      setMensajePago(fue);
      setModal("pago");
      setPagando(false);
    }
  }

  let contenido: React.ReactNode;
  const conNegocio = cuenta && cuenta.usuario ? cuenta : null;

  if (!fb || sesion === "cargando") {
    contenido = errorCarga ? <ErrorCarga mensaje={errorCarga} onReintentar={() => window.location.reload()} /> : <Cargando />;
  } else if (sesion === "fuera") {
    contenido = <Bienvenida fb={fb} errorInicial={errorEntrada} />;
  } else if (pathname?.startsWith("/admin")) {
    // El panel de administrador solo necesita la sesión; él mismo revisa los permisos
    contenido = children;
  } else if (!cuenta) {
    contenido = errorCarga ? (
      <ErrorCarga mensaje={errorCarga} onReintentar={() => (setErrorCarga(""), void refrescar())} onSalir={salir} />
    ) : (
      <Cargando texto="Cargando tu cuenta…" />
    );
  } else if (!conNegocio) {
    contenido = <CrearNegocio fb={fb} onListo={refrescar} />;
  } else {
    const estado = conNegocio.efectivo.estado;
    contenido = (
      <>
        {estado === "prueba" && conNegocio.negocio.pruebaHasta !== undefined && (
          <TrialBanner hasta={conNegocio.negocio.pruebaHasta} onElegir={() => setModal("planes")} onFin={() => void refrescar()} />
        )}
        {estado === "pausado" && <PausaBanner onPagar={pagarReactivar} ocupado={pagando} />}
        {children}
        {/* Sin plan: la app sigue abierta detrás (no se pierde lo que estaba haciendo), pero hay que elegir plan */}
        {estado === "sin_plan" && <ElegirPlan precios={conNegocio.precios} onSalir={salir} />}
        {estado !== "sin_plan" && modal === "planes" && (
          <ElegirPlan
            precios={conNegocio.precios}
            titulo={conNegocio.efectivo.plan === "basico" ? "Mejora a Pro" : "Elige tu plan"}
            texto="Elige el plan que mejor le queda a tu negocio."
            onCerrar={() => setModal(null)}
          />
        )}
        {modal === "cuenta" && (
          <MiCuenta
            cuenta={conNegocio}
            fb={fb}
            onCerrar={() => setModal(null)}
            onRefrescar={refrescar}
            onPlanes={() => setModal("planes")}
          />
        )}
        {modal === "pago" && <PagoPendiente mensaje={mensajePago} onCerrar={() => setModal(null)} />}
      </>
    );
  }

  return (
    <ContextoCuenta.Provider value={valor}>
      {contenido}
      {aviso && (
        <div className="acct-toast" role="status">
          <span>{aviso.texto}</span>
          {aviso.pro && conNegocio && (
            <button className="btn small" onClick={() => (setAviso(null), setModal("planes"))}>
              Mejorar a Pro
            </button>
          )}
          <button className="acct-cerrar-toast" onClick={() => setAviso(null)} title="Cerrar">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </ContextoCuenta.Provider>
  );
}
