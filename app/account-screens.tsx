"use client";

import { useState, type FormEvent } from "react";
import { Check, LogOut, Mail, Shield, X } from "lucide-react";
import type { CuentaConNegocio } from "./account-context";
import { mensajeAuth } from "@/lib/auth-mensajes";
import { textoPaquete } from "@/lib/aviso-uso";
import { confirmacionCambio, type DatosCambio } from "@/lib/confirmar-plan";
import type { PaqueteId } from "@/lib/plans";
import type { PersonaEquipo } from "@/lib/account-api";

// Pantallas de la cuenta: bienvenida, crear negocio, elegir plan, pago manual y Mi cuenta.
// No importan Firebase: reciben sus funciones (fb) desde AccountGate, que lo carga solo con las cuentas encendidas.

export type FB = typeof import("@/lib/firebase-client");

const CORREO = "hectordehoyos@innovationtech1.com";
const WHATSAPP = "https://wa.me/12109900532";
const SIN_TARJETA = "El pago con tarjeta estará disponible muy pronto.";

type Respuesta = { ok: boolean; status: number; data: Record<string, unknown> };

// Llama a nuestras rutas /api (el token lo agrega auth-fetch) y siempre devuelve algo legible
async function api(url: string, method: string, body?: unknown): Promise<Respuesta> {
  try {
    const r = await fetch(url, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: data && typeof data === "object" ? data : {} };
  } catch {
    return { ok: false, status: 0, data: { error: "Revisa tu conexión a internet." } };
  }
}
const errorDe = (r: Respuesta, otro = "Algo salió mal. Intenta de nuevo.") =>
  typeof r.data.error === "string" && r.data.error ? r.data.error : otro;

// Va a Stripe (pago o portal). Si no se pudo, devuelve el mensaje que hay que mostrar:
// el del servidor si lo mandó, o «muy pronto» si la ruta todavía no existe (404).
async function irAStripe(ruta: string, cuerpo: unknown): Promise<true | string> {
  const r = await api(ruta, "POST", cuerpo);
  const url = r.data.url;
  if (r.ok && typeof url === "string" && url.startsWith("https://")) {
    window.location.href = url;
    return true;
  }
  if (r.status === 404 && typeof r.data.error !== "string") return SIN_TARJETA;
  return errorDe(r);
}

/* ---------------- Piezas comunes ---------------- */

function Logo() {
  return (
    <div className="acct-logo">
      <img src="/icons/icon-192.png" alt="" />
      <div className="logo">
        Innovation<span>TECH</span>
        <small>Studio</small>
      </div>
    </div>
  );
}

// Pregunta «¿seguro?» dentro de la página (sin window.confirm), encima de la pantalla que la abre.
// El contenido puede traer partes que no se traducen (por ejemplo, un correo).
function Confirmar({
  etiqueta,
  children,
  boton,
  ocupado,
  error,
  onSi,
  onNo,
}: {
  etiqueta: string;
  children: React.ReactNode;
  boton: string;
  ocupado: boolean;
  error?: string;
  onSi: () => void;
  onNo: () => void;
}) {
  return (
    <div className="welcome-backdrop acct-capa" role="alertdialog" aria-modal="true" aria-label={etiqueta}>
      <div className="acct-caja">
        <p>{children}</p>
        {error && <div className="error">{error}</div>}
        <div className="acct-acciones col">
          <button className="btn" disabled={ocupado} onClick={onSi}>
            {boton}
          </button>
          <button className="btn ghost" disabled={ocupado} onClick={onNo} autoFocus>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="acct-pantalla">
      <div className="acct-caja acct-centro">
        <Logo />
        <p className="muted">{texto}</p>
      </div>
    </div>
  );
}

export function ErrorCarga({ mensaje, onReintentar, onSalir }: { mensaje: string; onReintentar: () => void; onSalir?: () => void }) {
  return (
    <div className="acct-pantalla">
      <div className="acct-caja acct-centro">
        <Logo />
        <div className="error">{mensaje}</div>
        <div className="acct-acciones">
          <button className="btn" onClick={onReintentar}>
            Intentar de nuevo
          </button>
          {onSalir && (
            <button className="btn ghost" onClick={onSalir}>
              Cerrar sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Pago en efectivo, Zelle o Cash App: InnovationTECH activa la cuenta a mano
export function PagoManual() {
  return (
    <div className="acct-manual">
      <p>¿Pagas en efectivo, Zelle o Cash App? Escríbenos e InnovationTECH activará tu cuenta al confirmar tu pago.</p>
      <div className="acct-contacto">
        <a className="btn ghost small" href={`mailto:${CORREO}`}>
          <Mail size={15} aria-hidden /> <span data-no-translate>{CORREO}</span>
        </a>
        <a className="btn ghost small" href={WHATSAPP} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
      </div>
    </div>
  );
}

/* ---------------- Bienvenida (sin sesión) ---------------- */

type Modo = "entrar" | "crear" | "olvide";

export function Bienvenida({ fb, errorInicial = "" }: { fb: FB; errorInicial?: string }) {
  const [conCorreo, setConCorreo] = useState(false);
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(errorInicial);
  const [aviso, setAviso] = useState("");

  const cambiar = (m: Modo) => (setModo(m), setError(""), setAviso(""));

  async function google() {
    setOcupado(true);
    setError("");
    try {
      await fb.entrarConGoogle();
    } catch (e) {
      setError(mensajeAuth(e));
    } finally {
      setOcupado(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      if (modo === "entrar") await fb.entrarConCorreo(email, clave);
      else if (modo === "crear") await fb.crearConCorreo(email, clave);
      else {
        await fb.recuperarClave(email);
        setAviso("Te enviamos un correo para crear una nueva contraseña. Revisa también la carpeta de spam.");
      }
    } catch (err) {
      setError(mensajeAuth(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="acct-pantalla">
      <div className="acct-caja">
        <Logo />
        <h2>Bienvenido a InnovationTECH Studio</h2>
        <p className="muted acct-pitch">Crea el contenido de tu negocio con IA: textos, imágenes, reels y música.</p>

        {!conCorreo ? (
          <div className="acct-acciones col">
            <button className="btn" disabled={ocupado} onClick={google}>
              <GoogleG /> Entrar con Google
            </button>
            <button className="btn ghost" disabled={ocupado} onClick={() => setConCorreo(true)}>
              <Mail size={16} aria-hidden /> Entrar con correo
            </button>
          </div>
        ) : (
          <form onSubmit={enviar}>
            <div className="seg acct-modos" role="tablist">
              <button type="button" className={modo === "entrar" ? "active" : ""} onClick={() => cambiar("entrar")}>
                Entrar
              </button>
              <button type="button" className={modo === "crear" ? "active" : ""} onClick={() => cambiar("crear")}>
                Crear cuenta
              </button>
            </div>
            <label htmlFor="acct-email">Correo</label>
            <input
              id="acct-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
            />
            {modo !== "olvide" && (
              <>
                <label htmlFor="acct-clave">Contraseña</label>
                <input
                  id="acct-clave"
                  type="password"
                  autoComplete={modo === "crear" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder={modo === "crear" ? "Al menos 6 caracteres" : ""}
                />
              </>
            )}
            {modo === "crear" && <p className="muted">Te enviaremos un correo para confirmar tu dirección.</p>}
            <button className="btn acct-ancho" type="submit" disabled={ocupado}>
              {modo === "entrar" ? "Entrar" : modo === "crear" ? "Crear cuenta" : "Enviar enlace"}
            </button>
            <div className="acct-links">
              {modo === "olvide" ? (
                <button type="button" className="acct-link" onClick={() => cambiar("entrar")}>
                  Volver a entrar
                </button>
              ) : (
                <button type="button" className="acct-link" onClick={() => cambiar("olvide")}>
                  Olvidé mi contraseña
                </button>
              )}
              <button type="button" className="acct-link" onClick={() => (setConCorreo(false), setError(""), setAviso(""))}>
                Entrar con Google
              </button>
            </div>
          </form>
        )}
        {error && <div className="error">{error}</div>}
        {aviso && <div className="notice">{aviso}</div>}
      </div>
    </div>
  );
}

// Logo de Google (la "G" de colores)
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* ---------------- Crear negocio (con sesión, sin cuenta) ---------------- */

export function CrearNegocio({ fb, onListo }: { fb: FB; onListo: () => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [verificar, setVerificar] = useState(false);

  async function crear() {
    setOcupado(true);
    setError("");
    const r = await api("/api/cuenta", "POST", { nombre: nombre.trim() });
    if (r.ok) {
      await onListo();
      setOcupado(false);
      return;
    }
    if (r.data.codigo === "VERIFICAR_CORREO") {
      // Primero tiene que confirmar su correo: para empezar su prueba gratis o para unirse al equipo
      // que lo invitó. El texto que se muestra es el del servidor (dice cuál de los dos casos es).
      if (!verificar) await fb.enviarVerificacion().catch(() => {});
      setVerificar(true);
    }
    setError(errorDe(r));
    setOcupado(false);
  }

  async function yaConfirme() {
    setOcupado(true);
    setError("");
    try {
      await fb.recargarUsuario();
    } catch {
      /* se intenta igual */
    }
    setOcupado(false);
    await crear();
  }

  const valido = nombre.trim().length >= 1 && nombre.trim().length <= 80;

  return (
    <div className="acct-pantalla">
      <div className="acct-caja">
        <Logo />
        <h2>Crea tu negocio</h2>
        <p className="muted acct-pitch">Empieza con 10 minutos de prueba Pro gratis, sin tarjeta.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valido && !ocupado) crear();
          }}
        >
          <label htmlFor="acct-negocio">Nombre de tu negocio</label>
          <input
            id="acct-negocio"
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Tortas Tortuga"
            autoComplete="organization"
          />
          <p className="muted">¿Te invitaron a un equipo? Escribe cualquier nombre y te uniremos al negocio que te invitó.</p>
          <button className="btn acct-ancho" type="submit" disabled={!valido || ocupado}>
            {ocupado ? "Creando…" : "Crear mi negocio"}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
        {verificar && (
          <button className="btn ghost acct-ancho" disabled={ocupado} onClick={yaConfirme}>
            <Check size={16} aria-hidden /> Ya confirmé mi correo
          </button>
        )}
        <div className="acct-links">
          <button className="acct-link" onClick={() => fb.salir()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Elegir plan ---------------- */

const INCLUYE_BASICO = [
  "Textos y asistente",
  "Imágenes con IA",
  "Editor de imágenes y quitar fondo",
  "Calendario de contenido",
  "Carrusel y todos los tamaños",
  "Música",
  "1,000 mensajes y textos y 300 imágenes al mes",
];
const INCLUYE_PRO = [
  "Todo lo de Básico",
  "Reels",
  "Editor de video",
  "Voz en off y subtítulos",
  "Hasta 3 personas",
  "3,000 mensajes y textos, 1,000 imágenes, 250 voces y 250 subtítulos al mes",
];

export function ElegirPlan({
  precios,
  cuenta,
  onCerrar,
  onSalir,
  titulo = "Elige tu plan",
  texto = "Tu prueba terminó. Elige un plan para seguir creando.",
}: {
  precios: { basico: number; pro: number };
  // Para saber si ya paga con tarjeta: entonces el cambio se cobra al momento y se pide confirmar
  cuenta?: DatosCambio;
  onCerrar?: () => void;
  onSalir?: () => void;
  titulo?: string;
  texto?: string;
}) {
  const [ocupado, setOcupado] = useState<"" | "basico" | "pro">("");
  const [error, setError] = useState("");
  const [pregunta, setPregunta] = useState<{ plan: "basico" | "pro"; mensaje: string; boton: string } | null>(null);

  async function ir(plan: "basico" | "pro") {
    setOcupado(plan);
    setError("");
    const fue = await irAStripe("/api/stripe/checkout", { plan });
    if (fue !== true) {
      setError(fue);
      setOcupado("");
      setPregunta(null);
    }
  }

  function elegir(plan: "basico" | "pro") {
    const c = cuenta ? confirmacionCambio(cuenta, plan) : null;
    if (c) {
      setError("");
      setPregunta({ plan, ...c });
    } else void ir(plan);
  }

  return (
    <>
      <div className="welcome-backdrop acct-capa" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="acct-caja acct-ancha">
          {onCerrar && (
            <button className="acct-cerrar" onClick={onCerrar} title="Cerrar">
              <X size={20} aria-hidden />
            </button>
          )}
          <h2>{titulo}</h2>
          <p className="muted acct-pitch">{texto}</p>
          <div className="acct-planes">
            <PlanCard nombre="Básico" precio={precios.basico} incluye={INCLUYE_BASICO}>
              <button className="btn ghost acct-ancho" disabled={!!ocupado} onClick={() => elegir("basico")}>
                {ocupado === "basico" ? "Abriendo…" : "Elegir Básico"}
              </button>
            </PlanCard>
            <PlanCard nombre="Pro" precio={precios.pro} incluye={INCLUYE_PRO} destacado>
              <button className="btn acct-ancho" disabled={!!ocupado} onClick={() => elegir("pro")}>
                {ocupado === "pro" ? "Abriendo…" : "Elegir Pro"}
              </button>
            </PlanCard>
          </div>
          {error && <div className="notice">{error}</div>}
          <PagoManual />
          {onSalir && (
            <div className="acct-links">
              <button className="acct-link" onClick={onSalir}>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
      {pregunta && (
        <Confirmar
          etiqueta="Confirmar cambio de plan"
          boton={ocupado ? "Abriendo…" : pregunta.boton}
          ocupado={!!ocupado}
          onSi={() => void ir(pregunta.plan)}
          onNo={() => setPregunta(null)}
        >
          {pregunta.mensaje}
        </Confirmar>
      )}
    </>
  );
}

function PlanCard({
  nombre,
  precio,
  incluye,
  destacado,
  children,
}: {
  nombre: string;
  precio: number;
  incluye: string[];
  destacado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`acct-plan ${destacado ? "destacado" : ""}`}>
      <h3>{nombre}</h3>
      <p className="acct-precio">
        <strong data-no-translate>${precio}</strong>
        <span>/mes</span>
      </p>
      <ul>
        {incluye.map((t) => (
          <li key={t}>
            <Check size={15} aria-hidden /> {t}
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

/* ---------------- Pausado: pagar para reactivar ---------------- */

// Abre el portal de Stripe. Si no se puede, devuelve el mensaje a mostrar (junto al pago manual).
export async function abrirPortal(): Promise<true | string> {
  return irAStripe("/api/stripe/portal", {});
}

export function PagoPendiente({ onCerrar, mensaje = SIN_TARJETA }: { onCerrar: () => void; mensaje?: string }) {
  return (
    <div className="welcome-backdrop acct-capa" role="dialog" aria-modal="true" aria-label="Reactivar tu cuenta">
      <div className="acct-caja">
        <button className="acct-cerrar" onClick={onCerrar} title="Cerrar">
          <X size={20} aria-hidden />
        </button>
        <h2>Reactiva tu cuenta</h2>
        <p className="muted">{mensaje}</p>
        <PagoManual />
      </div>
    </div>
  );
}

/* ---------------- Mi cuenta ---------------- */

const NOMBRE_PLAN: Record<string, string> = { prueba: "Prueba Pro", basico: "Básico", pro: "Pro" };
const NOMBRE_ESTADO: Record<string, string> = {
  prueba: "En prueba",
  activo: "Activa",
  pausado: "En pausa",
  sin_plan: "Sin plan",
};
// «Se reinicia el 1 de diciembre»: el día 1 del mes siguiente, en la hora de Chicago
const fechaReinicio = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago", day: "numeric", month: "long" });
const CONTADORES: [keyof CuentaConNegocio["uso"], string][] = [
  ["textos", "Mensajes y textos"],
  ["imagenes", "Imágenes"],
  ["voces", "Voces"],
  ["subtitulos", "Subtítulos"],
];

export function MiCuenta({
  cuenta,
  fb,
  onCerrar,
  onRefrescar,
  onPlanes,
}: {
  cuenta: CuentaConNegocio;
  fb: FB;
  onCerrar: () => void;
  onRefrescar: () => Promise<void>;
  onPlanes: () => void;
}) {
  const [manual, setManual] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [invitado, setInvitado] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [comprando, setComprando] = useState<"" | PaqueteId>("");
  const [errorPaquete, setErrorPaquete] = useState("");
  const [quitando, setQuitando] = useState<PersonaEquipo | null>(null); // a quién se pregunta si se quita
  const [errorQuitar, setErrorQuitar] = useState("");
  const { negocio, efectivo, uso, limites, saldo, equipo } = cuenta;
  const planPro = efectivo.plan === "pro";

  async function comprar(id: PaqueteId) {
    setComprando(id);
    setErrorPaquete("");
    const fue = await irAStripe("/api/stripe/paquete", { paquete: id });
    if (fue !== true) {
      setErrorPaquete(fue);
      setComprando("");
    }
  }

  async function portal() {
    setOcupado(true);
    const fue = await abrirPortal();
    if (fue !== true) {
      setManual(fue);
      setOcupado(false);
    }
  }

  async function invitar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError("");
    setAviso("");
    const r = await api("/api/cuenta/invitar", "POST", { email: invitado.trim() });
    if (r.ok) {
      setAviso(`Invitación lista. Pídele a ${invitado.trim()} que entre a Studio con ese correo.`);
      setInvitado("");
      await onRefrescar();
    } else setError(errorDe(r));
    setOcupado(false);
  }

  async function cancelar(email: string) {
    setOcupado(true);
    setError("");
    setAviso("");
    const r = await api("/api/cuenta/invitar", "DELETE", { email });
    if (r.ok) await onRefrescar();
    else setError(errorDe(r));
    setOcupado(false);
  }

  async function quitar(p: PersonaEquipo) {
    setOcupado(true);
    setErrorQuitar("");
    const r = await api(`/api/cuenta/miembros/${encodeURIComponent(p.uid)}`, "DELETE");
    if (r.ok) {
      setQuitando(null);
      await onRefrescar();
    } else setErrorQuitar(errorDe(r));
    setOcupado(false);
  }

  return (
    <>
      <div className="welcome-backdrop acct-capa" role="dialog" aria-modal="true" aria-label="Mi cuenta">
        <div className="acct-caja acct-ancha">
          <button className="acct-cerrar" onClick={onCerrar} title="Cerrar">
            <X size={20} aria-hidden />
          </button>
          <h2>Mi cuenta</h2>
          <p className="acct-negocio" data-no-translate>
            {negocio.nombre}
          </p>
          <p className="muted" data-no-translate>
            {cuenta.usuario.email}
          </p>
          <div className="acct-fila">
            <span>
              Plan: <strong>{efectivo.plan ? NOMBRE_PLAN[efectivo.plan] : "Sin plan"}</strong>
            </span>
            <span className={`acct-estado ${efectivo.estado}`}>{NOMBRE_ESTADO[efectivo.estado]}</span>
          </div>

          <h3 className="acct-sub">Uso del mes</h3>
          <ul className="acct-uso">
            {CONTADORES.map(([c, nombre]) => {
              const tope = limites[c];
              const usado = uso[c] ?? 0;
              const extra = saldo[c] ?? 0;
              return (
                <li key={c}>
                  <span>{nombre}</span>
                  {tope > 0 ? (
                    <>
                      {/* Un solo texto, para que el traductor lo reconozca completo (lib/locales/en.ts) */}
                      <span>{`Te quedan ${Math.max(0, tope - usado)} de ${tope} este mes`}</span>
                      <div className="bar">
                        <div style={{ width: `${Math.min(100, (usado / tope) * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <span className="muted">No incluido</span>
                  )}
                  {extra > 0 && (
                    <span className="acct-saldo">{`+${extra} de paquete`}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted">
            Se reinicia el <span data-no-translate>{fechaReinicio.format(cuenta.reinicio)}</span>
          </p>

          <div className="acct-acciones">
            {efectivo.plan !== "pro" && (
              <button className="btn small" onClick={onPlanes}>
                {efectivo.plan === "basico" ? "Mejorar a Pro" : "Elegir plan"}
              </button>
            )}
            {cuenta.esDueno && negocio.stripe?.customerId && (efectivo.estado === "activo" || efectivo.estado === "pausado") && (
              <button className="btn ghost small" disabled={ocupado} onClick={portal}>
                Administrar suscripción
              </button>
            )}
          </div>
          {manual && (
            <>
              <div className="notice">{manual}</div>
              <PagoManual />
            </>
          )}

          {cuenta.esDueno && cuenta.paquetes.length > 0 && (
            <>
              <h3 className="acct-sub">Paquetes extra</h3>
              <p className="muted">Se pagan una sola vez y no vencen. Se usan cuando se acaba lo incluido en el mes.</p>
              <div className="acct-acciones col acct-paquetes">
                {cuenta.paquetes.map((p) => (
                  <button key={p.id} className="btn ghost" disabled={!!comprando} onClick={() => void comprar(p.id)}>
                    {comprando === p.id ? "Abriendo…" : textoPaquete(p.id, p.monto, p.contenido)}
                  </button>
                ))}
              </div>
              {errorPaquete && <div className="error">{errorPaquete}</div>}
            </>
          )}

          {cuenta.esDueno && equipo && planPro && (
            <>
              <h3 className="acct-sub">Mi equipo</h3>
              <p className="muted">
                Personas en tu equipo: <strong data-no-translate>{equipo.miembros}</strong>. El plan Pro permite hasta 3 personas, contando las invitaciones.
              </p>
              {equipo.personas && equipo.personas.length > 0 && (
                <ul className="acct-invitaciones">
                  {equipo.personas.map((p) => (
                    <li key={p.uid}>
                      <span>
                        {p.email ? <span data-no-translate>{p.email}</span> : <span>Persona sin correo</span>}
                        {p.esDueno && (
                          <>
                            {" · "}
                            <span>Dueño</span>
                          </>
                        )}
                      </span>
                      {!p.esDueno && (
                        <button
                          className="btn ghost small"
                          disabled={ocupado}
                          onClick={() => (setErrorQuitar(""), setQuitando(p))}
                        >
                          Quitar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form className="acct-invitar" onSubmit={invitar}>
                <input
                  type="email"
                  required
                  value={invitado}
                  onChange={(e) => setInvitado(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  aria-label="Correo de la persona"
                />
                <button className="btn small" type="submit" disabled={ocupado || !invitado.trim()}>
                  Invitar
                </button>
              </form>
              {equipo.invitaciones && equipo.invitaciones.length > 0 && (
                <ul className="acct-invitaciones">
                  {equipo.invitaciones.map((e) => (
                    <li key={e}>
                      <span data-no-translate>{e}</span>
                      <span className="muted">Pendiente</span>
                      <button className="btn ghost small" disabled={ocupado} onClick={() => cancelar(e)}>
                        Cancelar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && <div className="error">{error}</div>}
          {aviso && <div className="ok">{aviso}</div>}

          <div className="acct-acciones acct-pie">
            {cuenta.esAdmin && (
              <a className="btn ghost small" href="/admin">
                <Shield size={15} aria-hidden /> Panel de administrador
              </a>
            )}
            <button className="btn ghost small" onClick={() => fb.salir()}>
              <LogOut size={15} aria-hidden /> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
      {quitando && (
        <Confirmar
          etiqueta="Quitar del equipo"
          boton={ocupado ? "Quitando…" : "Sí, quitar"}
          ocupado={ocupado}
          error={errorQuitar}
          onSi={() => void quitar(quitando)}
          onNo={() => (setQuitando(null), setErrorQuitar(""))}
        >
          ¿Quitar a{" "}
          {quitando.email ? <span data-no-translate>{quitando.email}</span> : <span>esta persona</span>} del equipo? Ya no
          podrá usar Studio con tu cuenta.
        </Confirmar>
      )}
    </>
  );
}
