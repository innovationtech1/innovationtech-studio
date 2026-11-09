"use client";

import { useEffect, useState } from "react";
import type { DemoStatus } from "@/lib/use-demo";
import { refrescarCuenta } from "./account-context";
import { borrarClaveCfLocal, EVENTO_AJUSTES, leerClaveCfLocal } from "@/lib/limpiar-dispositivo";

import { ArrowLeft, Check, CircleCheck, CircleX, ClipboardPaste, Cog, ExternalLink, Plug, Rocket } from "lucide-react";
type Check = { ok: boolean; label: string; help?: string };

const WORKERS_AI_URL = "https://dash.cloudflare.com/?to=/:account/ai/workers-ai";

async function pasteFromClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    return "";
  }
}

// Prueba las claves de Cloudflare y explica qué corregir
export async function testCloudflare(accountId: string, token: string): Promise<{ ok: boolean; checks: Check[] }> {
  const r = await fetch("/api/cf-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, token }),
  });
  return r.json();
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checklist">
      {checks.map((c) => (
        <li key={c.label} className={c.ok ? "ok" : "bad"}>
          <span className="check-ic">{c.ok ? <CircleCheck size={20} aria-hidden /> : <CircleX size={20} aria-hidden />}</span>
          <div>
            <strong>{c.label}</strong>
            {c.help && <p>{c.help}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export type ResultadoClave = { ok: true } | { ok: false; error: string; checks?: Check[] };

// Guarda la clave de Cloudflare en la cuenta del negocio (solo el dueño). El servidor la prueba
// antes de guardarla. Si se guardó: se borra la copia del navegador y se vuelve a leer la cuenta.
export async function guardarClaveEnCuenta(accountId: string, token: string): Promise<ResultadoClave> {
  try {
    const r = await fetch("/api/cuenta/clave-ia", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: accountId.trim(), token: token.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.ok) {
      borrarClaveCfLocal();
      await refrescarCuenta();
      return { ok: true };
    }
    return {
      ok: false,
      error: typeof d?.error === "string" && d.error ? d.error : "Algo salió mal. Intenta de nuevo.",
      checks: Array.isArray(d?.checks) && d.checks.length > 0 ? d.checks : undefined,
    };
  } catch {
    return { ok: false, error: "No se pudo guardar. Revisa tu internet." };
  }
}

// Asistente paso a paso para conectar la cuenta gratis de Cloudflare.
// Sin `enCuenta` (modo demo / cuentas apagadas): prueba la clave y la guarda en el navegador (onSave).
// Con `enCuenta` (dueño, cuentas encendidas): el último paso la guarda en la cuenta del negocio.
export function CloudflareWizard({
  settings,
  onSave,
  onFinish,
  enCuenta = false,
}: {
  settings: { cfAccountId: string; cfToken: string };
  onSave?: (accountId: string, token: string) => void;
  onFinish: () => void;
  enCuenta?: boolean;
}) {
  const [step, setStep] = useState(settings.cfAccountId && settings.cfToken ? 4 : 1);
  const [accountId, setAccountId] = useState(settings.cfAccountId);
  const [token, setToken] = useState(settings.cfToken);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [done, setDone] = useState(false);

  const idValid = /^[0-9a-f]{32}$/i.test(accountId.trim());

  const test = async () => {
    setTesting(true);
    setChecks(null);
    setError("");
    if (enCuenta) {
      const r = await guardarClaveEnCuenta(accountId, token);
      if (r.ok) setDone(true);
      else if (r.checks) setChecks(r.checks);
      else setError(r.error);
      setTesting(false);
      return;
    }
    try {
      const r = await testCloudflare(accountId, token);
      setChecks(r.checks);
      if (r.ok) {
        onSave?.(accountId.trim(), token.trim());
        setDone(true);
      }
    } catch {
      setChecks([{ ok: false, label: "Conexión", help: "No se pudo hacer la prueba. Revisa tu internet." }]);
    } finally {
      setTesting(false);
    }
  };

  const steps = ["Crear cuenta", "Account ID", "Token", "Probar"];

  return (
    <div className="wizard">
      <div className="wizard-steps">
        {steps.map((s, i) => (
          <button key={s} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""} onClick={() => setStep(i + 1)}>
            <span>{step > i + 1 ? <Check size={15} strokeWidth={3} aria-hidden /> : i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="wizard-body">
          <h3>1. Crea tu cuenta gratis de Cloudflare</h3>
          <p>
            Cloudflare da <strong>uso gratis todos los días</strong> para crear textos, imágenes y voz con IA. No pide tarjeta de crédito.
          </p>
          <div className="actions">
            <a className="btn" href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">
              Crear cuenta gratis <ExternalLink size={14} aria-hidden />
            </a>
            <button className="btn ghost" onClick={() => setStep(2)}>
              Ya tengo cuenta
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <h3>2. Copia tu Account ID</h3>
          <ol>
            <li>
              Abre la página de Workers AI:{" "}
              <a href={WORKERS_AI_URL} target="_blank" rel="noreferrer">
                abrir Workers AI <ExternalLink size={14} aria-hidden />
              </a>
            </li>
            <li>
              Presiona <strong>«Use REST API»</strong>.
            </li>
            <li>
              Copia el <strong>Account ID</strong> (32 letras y números) y pégalo aquí:
            </li>
          </ol>
          <div className="paste-row">
            <input value={accountId} onChange={(e) => setAccountId(e.target.value.trim())} placeholder="Ej.: 6fe266a045b099db7c54b87da9397143" autoComplete="off" />
            <button className="btn ghost small" onClick={async () => setAccountId(await pasteFromClipboard())}>
              <ClipboardPaste size={16} aria-hidden /> Pegar
            </button>
          </div>
          {accountId && <p className={idValid ? "ok" : "warn"}>{idValid ? "Formato correcto" : "Debe tener 32 caracteres (0-9 y a-f)"}</p>}
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={16} aria-hidden /> Atrás
            </button>
            <button className="btn" disabled={!idValid} onClick={() => setStep(3)}>
              Siguiente
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <h3>3. Crea tu token de Workers AI</h3>
          <ol>
            <li>
              En la misma página («Use REST API»), presiona <strong>«Create a Workers AI API Token»</strong>.
            </li>
            <li>
              Revisa los permisos: <strong>Account → Workers AI → Read</strong> y <strong>Edit</strong>. En «Account Resources» elige{" "}
              <strong>Include → tu cuenta</strong>.
            </li>
            <li>
              Presiona <strong>Continue to summary</strong> y luego <strong>Create Token</strong>.
            </li>
            <li>Copia el token (solo se muestra una vez) y pégalo aquí:</li>
          </ol>
          <div className="paste-row">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="Tu token de Workers AI" autoComplete="off" />
            <button className="btn ghost small" onClick={async () => setToken(await pasteFromClipboard())}>
              <ClipboardPaste size={16} aria-hidden /> Pegar
            </button>
          </div>
          <p className="muted">
            {enCuenta
              ? "El token es como una contraseña: no lo compartas con nadie. Se guarda cifrado en tu cuenta y lo usa todo tu equipo."
              : "El token es como una contraseña: no lo compartas con nadie. Se guarda solo en este dispositivo."}
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={16} aria-hidden /> Atrás
            </button>
            <button className="btn" disabled={!token} onClick={() => (setStep(4), test())}>
              Siguiente: probar
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="wizard-body">
          <h3>4. Probar la conexión</h3>
          {!checks && !testing && <p>Revisaremos que tu Account ID y tu token funcionen.</p>}
          {testing && (
            <div className="notice">{enCuenta ? "Probando y guardando en tu cuenta…" : "Probando la conexión con Cloudflare…"}</div>
          )}
          {checks && <CheckList checks={checks} />}
          {error && <div className="error">{error}</div>}
          {done ? (
            <div className="success-box">
              <strong>¡Listo! Tu cuenta quedó conectada.</strong>
              <p>
                {enCuenta
                  ? "Ya puedes usar Studio sin los límites del mes. Lo usa todo tu equipo."
                  : "Ya puedes crear textos, imágenes y voz con IA gratis, sin los límites del modo demo."}
              </p>
              <button className="btn" onClick={onFinish}>
                Empezar a crear
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="btn ghost" onClick={() => setStep(checks?.[0] && !checks[0].ok ? 2 : 3)}>
                <ArrowLeft size={16} aria-hidden /> Corregir
              </button>
              <button className="btn" disabled={testing || !accountId || !token} onClick={test}>
                <Plug size={16} aria-hidden /> Probar conexión
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type IaPropia = { cuentaFin: string; conectada: number; legible: boolean } | null;

// «Tu cuenta de Cloudflare (opcional)» con las cuentas encendidas (Mi cuenta y Configuración).
// Dueño: estado, «Conectar Cloudflare» (abre el asistente) y «Guardar en tu cuenta» si este
// dispositivo tiene una clave y la cuenta no. Miembro: solo la línea, si el negocio tiene la suya.
// `acciones`: botones extra junto a «Conectada» (en Mi cuenta, «Desconectar»).
export function CloudflareCuenta({
  iaPropia,
  esDueno,
  titulo,
  acciones,
  onFinish,
}: {
  iaPropia: IaPropia;
  esDueno: boolean;
  titulo: (texto: string) => React.ReactNode;
  acciones?: React.ReactNode;
  onFinish?: () => void;
}) {
  const [local, setLocal] = useState<{ accountId: string; token: string } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<{ error: string; checks?: Check[] } | null>(null);

  useEffect(() => {
    const leer = () => setLocal(leerClaveCfLocal());
    leer();
    window.addEventListener(EVENTO_AJUSTES, leer);
    return () => window.removeEventListener(EVENTO_AJUSTES, leer);
  }, []);

  if (!esDueno) return iaPropia ? <p className="muted">Tu negocio usa su propia cuenta de Cloudflare.</p> : null;

  const conectada = !!iaPropia?.legible;

  async function subirLocal() {
    if (!local) return;
    setOcupado(true);
    setFallo(null);
    const r = await guardarClaveEnCuenta(local.accountId, local.token);
    if (!r.ok) setFallo({ error: r.error, checks: r.checks });
    setOcupado(false);
  }

  return (
    <>
      {titulo("Tu cuenta de Cloudflare (opcional)")}
      {conectada ? (
        <p className="ok">{`Conectada (cuenta …${iaPropia!.cuentaFin}) · Sin límites del mes`}</p>
      ) : iaPropia ? (
        <p className="notice">Tu Cloudflare conectado ya no se puede leer. Conéctalo otra vez.</p>
      ) : (
        <p className="muted">Conéctala para usar Studio sin los límites del mes. Es gratis en Cloudflare.</p>
      )}
      {!iaPropia && local && !abierto && (
        <p className="muted">Este dispositivo tiene guardada una clave de Cloudflare. Guárdala en tu cuenta para que la use todo tu equipo.</p>
      )}
      <div className="acct-acciones">
        {!conectada && !abierto && (
          <button className="btn small" disabled={ocupado} onClick={() => (setFallo(null), setAbierto(true))}>
            <Plug size={15} aria-hidden /> Conectar Cloudflare
          </button>
        )}
        {!iaPropia && local && !abierto && (
          <button className="btn ghost small" disabled={ocupado} onClick={() => void subirLocal()}>
            {ocupado ? "Guardando…" : "Guardar en tu cuenta"}
          </button>
        )}
        {conectada && !abierto && acciones}
      </div>
      {fallo && (fallo.checks ? <CheckList checks={fallo.checks} /> : <div className="error">{fallo.error}</div>)}
      {abierto && (
        <>
          <CloudflareWizard
            settings={{ cfAccountId: local?.accountId ?? "", cfToken: local?.token ?? "" }}
            enCuenta
            onFinish={() => (setAbierto(false), onFinish?.())}
          />
          {!conectada && (
            <div className="acct-acciones">
              <button className="btn ghost small" onClick={() => setAbierto(false)}>
                Cerrar asistente
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// Pantalla de bienvenida (primera vez)
export function Welcome({
  demo,
  onDemo,
  onSetup,
  onHaveKeys,
}: {
  demo: DemoStatus | null;
  onDemo: () => void;
  onSetup: () => void;
  onHaveKeys: () => void;
}) {
  return (
    <div className="welcome-backdrop">
      <div className="welcome" role="dialog" aria-label="Bienvenida">
        <img src="/icons/icon-192.png" alt="" />
        <h2>¡Bienvenido a InnovationTECH Studio!</h2>
        <p>Crea textos, imágenes y videos de marketing con inteligencia artificial. Gratis y desde tu celular.</p>
        <div className="welcome-actions">
          {demo?.demo && (
            <button className="btn big" onClick={onDemo}>
              <Rocket size={16} aria-hidden /> Probar ahora (modo demo)
              <small>
                Sin configurar nada · {demo.limits?.image} imágenes y {demo.limits?.text} textos al día
              </small>
            </button>
          )}
          <button className={`btn big ${demo?.demo ? "ghost" : ""}`} onClick={onSetup}>
            <Cog size={16} aria-hidden /> Conectar mi cuenta gratis
            <small>Uso diario gratis, sin límites del demo · toma unos 5 minutos</small>
          </button>
          <button className="btn ghost small" onClick={onHaveKeys}>
            Ya tengo mis claves
          </button>
        </div>
      </div>
    </div>
  );
}
