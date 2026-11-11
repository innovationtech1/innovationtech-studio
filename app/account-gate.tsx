"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { installAuthFetch } from "@/lib/auth-fetch";
import { mensajeAuth } from "@/lib/auth-mensajes";
import { guardarUltimoUid, leerUltimoUid, limpiarDispositivo } from "@/lib/limpiar-dispositivo";
import { ContextoCuenta, registrarRefresco, type Cuenta, type ValorCuenta, marcarDemoALaVista, useDemoALaVista } from "./account-context";
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
import TrialBanner, { AvisoUsoBanner, PausaBanner } from "./trial-banner";
import { claveAviso80, contadoresEnAviso, textoAviso80 } from "@/lib/aviso-uso";
import { mesChicago, type Contador } from "@/lib/plans";

// Puerta de las cuentas: solo se usa con NEXT_PUBLIC_STUDIO_CUENTAS=on (ver app/layout.tsx).
// Carga Firebase, pide la cuenta a /api/cuenta y muestra la pantalla que toca según su estado.

type Sesion = "cargando" | "fuera" | "dentro";
// pro: botón «Mejorar a Pro» · paquetes: botón «Ver paquetes» (abre Mi cuenta)
type Aviso = { texto: string; pro?: boolean; paquetes?: boolean };

// Se vuelve a leer la cuenta cada 5 minutos, solo con la pestaña a la vista (cuida las lecturas
// gratis de Firestore, compartidas con NOVA). También al volver a la pestaña y después de cada acción.
const CADA = 5 * 60_000;

const PREGUNTA_SALIR =
  "Vamos a cerrar tu sesión y a borrar de este dispositivo tus claves propias (Cloudflare, Anthropic, Replicate).\n\n" +
  "¿Quieres borrar también la galería y «Mi marca» guardadas en este dispositivo? Hazlo si otras personas lo usan.\n\n" +
  "Aceptar: borrar también · Cancelar: conservarlas";
const PREGUNTA_OTRA_PERSONA =
  "Entró otra cuenta en este dispositivo. Borramos las claves propias que había guardadas.\n\n" +
  "¿Quieres borrar también la galería y «Mi marca» de la persona anterior?\n\n" +
  "Aceptar: borrar · Cancelar: conservarlas";

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
  const [aviso80, setAviso80] = useState<Contador | null>(null); // contador del aviso del 80% a la vista
  const pathname = usePathname();

  // Cada cambio de sesión invalida las respuestas que vengan en camino de la sesión anterior
  const generacion = useRef(0);
  const dentro = useRef(false);
  const tieneCuenta = useRef(false);
  // «Mi cuenta» abierta por el dueño de un negocio Pro: se piden también las invitaciones
  const conEquipo = useRef(false);

  const refrescar = useCallback(async () => {
    if (!dentro.current) return;
    const gen = generacion.current;
    try {
      const r = await fetch(conEquipo.current ? "/api/cuenta?equipo=1" : "/api/cuenta", { cache: "no-store" });
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
  const alCodigo = useRef((codigo: string, mensaje: string) => {});
  alCodigo.current = (codigo: string, mensaje: string) => {
    if (codigo === "PAUSADO" || codigo === "SIN_PLAN" || codigo === "LIMITE") void refrescar();
    // Se acabó lo del mes: el mensaje del servidor con «Ver paquetes». En la prueba no hay paquetes
    // (se revisa el plan y también el mensaje, por si la cuenta guardada aquí todavía no se actualizó).
    const c = cuenta && cuenta.usuario ? cuenta : null;
    const dePrueba = mensaje.startsWith("Llegaste al límite de la prueba");
    if (codigo === "LIMITE" && mensaje && c && c.efectivo.plan !== "prueba" && !dePrueba) {
      setAviso({ texto: mensaje, paquetes: true });
    }
    if (codigo === "PLAN") setAviso({ texto: mensaje || "Esta herramienta es del plan Pro.", pro: true });
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
          onCodigo: (codigo, mensaje) => alCodigo.current(codigo, mensaje),
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
          setAviso80(null);
          setSesion(u ? "dentro" : "fuera");
          if (!u) return;
          // Otra persona entra en este dispositivo: se borran las claves propias de la anterior
          const gen = generacion.current;
          const anterior = leerUltimoUid();
          guardarUltimoUid(u.uid);
          if (anterior && anterior !== u.uid) {
            void limpiarDispositivo(PREGUNTA_OTRA_PERSONA).then(() => {
              if (gen === generacion.current) void refrescar();
            });
          } else void refrescar();
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

  // 2) Se vuelve a leer la cuenta cada 5 minutos mientras la pestaña está a la vista y al regresar a ella
  useEffect(() => {
    if (sesion !== "dentro") return;
    let id: ReturnType<typeof setInterval> | null = null;
    const arrancar = () => {
      if (!id) id = setInterval(() => void refrescar(), CADA);
    };
    const parar = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const alCambiar = () => {
      if (document.visibilityState === "visible") {
        void refrescar();
        arrancar();
      } else parar(); // en segundo plano no se lee nada
    };
    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiar);
    };
  }, [sesion, refrescar]);

  // Al abrir «Mi cuenta» (dueño con plan) se lee la cuenta con las personas e invitaciones del equipo
  useEffect(() => {
    if (modal === "cuenta" && conEquipo.current) void refrescar();
  }, [modal, refrescar]);

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

  // 3b) Regreso de Stripe al comprar un paquete: ?paquete=ok o ?paquete=cancelado
  useEffect(() => {
    const url = new URL(window.location.href);
    const paquete = url.searchParams.get("paquete");
    if (!paquete) return;
    url.searchParams.delete("paquete");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (paquete !== "ok") return;
    setAviso({ texto: "¡Listo! Tu paquete se agregará en unos segundos." });
    // El aviso de Stripe llega al servidor unos segundos después: entonces se vuelve a leer la cuenta.
    // No se cancela al desmontar: en desarrollo React monta dos veces y la segunda ya no ve ?paquete=ok.
    setTimeout(() => void refrescar(), 4000);
  }, [refrescar]);

  // 4) Aviso del 80%: solo para el dueño con un plan activo (no en la prueba), una vez por contador y mes
  // en este navegador. Se muestra uno a la vez; el siguiente sale al cerrar el anterior.
  const vistos = useRef(new Set<string>()); // por si localStorage no está disponible
  useEffect(() => {
    if (aviso80 || !cuenta || !cuenta.usuario) return;
    if (!cuenta.esDueno || cuenta.efectivo.estado !== "activo") return; // «activo» nunca es la prueba
    const mes = mesChicago(Date.now());
    const siguiente = contadoresEnAviso(cuenta.uso, cuenta.limites).find((c) => {
      const clave = claveAviso80(mes, c);
      if (vistos.current.has(clave)) return false;
      try {
        return !localStorage.getItem(clave);
      } catch {
        return true;
      }
    });
    if (!siguiente) return;
    const clave = claveAviso80(mes, siguiente);
    vistos.current.add(clave);
    try {
      localStorage.setItem(clave, "1");
    } catch {
      /* sin almacenamiento: se recuerda solo mientras la página esté abierta */
    }
    setAviso80(siguiente);
  }, [cuenta, aviso80]);

  // Los avisos se quitan solos
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.pro || aviso.paquetes ? 10_000 : 6_000);
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

  // «Cerrar sesión» (desde cualquier pantalla): antes se borran del dispositivo las claves propias
  // y se pregunta si también la galería y «Mi marca»
  const fbConLimpieza: FB | null = useMemo(
    () =>
      fb && {
        ...fb,
        salir: async () => {
          await limpiarDispositivo(PREGUNTA_SALIR);
          await fb.salir();
        },
      },
    [fb],
  );
  const salir = () => void fbConLimpieza?.salir();

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

  const demoVisible = useDemoALaVista();
  let contenido: React.ReactNode;
  const conNegocio = cuenta && cuenta.usuario ? cuenta : null;
  // En Básico también: si quedaron personas o invitaciones de cuando era Pro, el dueño las puede quitar
  conEquipo.current = modal === "cuenta" && !!conNegocio?.esDueno && conNegocio.efectivo.plan !== null;

  if (!fbConLimpieza || sesion === "cargando") {
    contenido = errorCarga ? <ErrorCarga mensaje={errorCarga} onReintentar={() => window.location.reload()} /> : <Cargando />;
  } else if (sesion === "fuera") {
    contenido = <Bienvenida fb={fbConLimpieza} errorInicial={errorEntrada} />;
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
    contenido = <CrearNegocio fb={fbConLimpieza} onListo={refrescar} />;
  } else {
    const estado = conNegocio.efectivo.estado;
    contenido = (
      <>
        {estado === "prueba" && conNegocio.negocio.pruebaHasta !== undefined && (
          <TrialBanner hasta={conNegocio.negocio.pruebaHasta} onElegir={() => setModal("planes")} onFin={() => void refrescar()} />
        )}
        {estado === "pausado" && <PausaBanner onPagar={pagarReactivar} ocupado={pagando} />}
        {aviso80 && estado === "activo" && (
          <AvisoUsoBanner
            texto={textoAviso80(aviso80)}
            onVer={() => (setAviso80(null), setModal("cuenta"))}
            onCerrar={() => setAviso80(null)}
          />
        )}
        {children}
        {/* Sin plan: la app sigue abierta detrás (no se pierde lo que estaba haciendo), pero hay que elegir plan */}
        {estado === "sin_plan" &&
          (demoVisible ? (
            <div className="acct-upsell">
              <span>Tu prueba gratis terminó. Descarga tu video y elige un plan para seguir creando.</span>
              <button className="btn small" onClick={() => marcarDemoALaVista(false)}>
                Ver planes
              </button>
            </div>
          ) : (
            <ElegirPlan precios={conNegocio.precios} onSalir={salir} />
          ))}
        {estado !== "sin_plan" && modal === "planes" && (
          <ElegirPlan
            precios={conNegocio.precios}
            cuenta={conNegocio}
            titulo={conNegocio.efectivo.plan === "basico" ? "Mejora a Pro" : "Elige tu plan"}
            texto="Elige el plan que mejor le queda a tu negocio."
            onCerrar={() => setModal(null)}
          />
        )}
        {modal === "cuenta" && (
          <MiCuenta
            cuenta={conNegocio}
            fb={fbConLimpieza}
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
          {aviso.pro && conNegocio?.esDueno && (
            <button className="btn small" onClick={() => (setAviso(null), setModal("planes"))}>
              Mejorar a Pro
            </button>
          )}
          {aviso.paquetes && conNegocio?.esDueno && (
            <button className="btn small" onClick={() => (setAviso(null), setModal("cuenta"))}>
              Ver paquetes
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
