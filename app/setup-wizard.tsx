"use client";

import { useState } from "react";
import type { Settings } from "@/lib/types";
import type { DemoStatus } from "@/lib/use-demo";

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
          <span>{c.ok ? "✅" : "❌"}</span>
          <div>
            <strong>{c.label}</strong>
            {c.help && <p>{c.help}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// Asistente paso a paso para conectar la cuenta gratis de Cloudflare
export function CloudflareWizard({
  settings,
  onSave,
  onFinish,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(settings.cfAccountId && settings.cfToken ? 4 : 1);
  const [accountId, setAccountId] = useState(settings.cfAccountId);
  const [token, setToken] = useState(settings.cfToken);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [done, setDone] = useState(false);

  const idValid = /^[0-9a-f]{32}$/i.test(accountId.trim());

  const test = async () => {
    setTesting(true);
    setChecks(null);
    try {
      const r = await testCloudflare(accountId, token);
      setChecks(r.checks);
      if (r.ok) {
        onSave({ ...settings, cfAccountId: accountId.trim(), cfToken: token.trim(), textProvider: "cloudflare", imageProvider: "cloudflare" });
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
            <span>{step > i + 1 ? "✓" : i + 1}</span>
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
              Crear cuenta gratis ↗
            </a>
            <button className="btn ghost" onClick={() => setStep(2)}>
              Ya tengo cuenta →
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
                abrir Workers AI ↗
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
              📋 Pegar
            </button>
          </div>
          {accountId && <p className={idValid ? "ok" : "warn"}>{idValid ? "✅ Formato correcto" : "⚠️ Debe tener 32 caracteres (0-9 y a-f)"}</p>}
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep(1)}>
              ← Atrás
            </button>
            <button className="btn" disabled={!idValid} onClick={() => setStep(3)}>
              Siguiente →
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
              📋 Pegar
            </button>
          </div>
          <p className="muted">🔒 El token es como una contraseña: no lo compartas con nadie. Se guarda solo en este dispositivo.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep(2)}>
              ← Atrás
            </button>
            <button className="btn" disabled={!token} onClick={() => (setStep(4), test())}>
              Siguiente: probar →
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="wizard-body">
          <h3>4. Probar la conexión</h3>
          {!checks && !testing && <p>Revisaremos que tu Account ID y tu token funcionen.</p>}
          {testing && <div className="notice">🔌 Probando la conexión con Cloudflare…</div>}
          {checks && <CheckList checks={checks} />}
          {done ? (
            <div className="success-box">
              <strong>🎉 ¡Listo! Tu cuenta quedó conectada.</strong>
              <p>Ya puedes crear textos, imágenes y voz con IA gratis, sin los límites del modo demo.</p>
              <button className="btn" onClick={onFinish}>
                Empezar a crear →
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="btn ghost" onClick={() => setStep(checks?.[0] && !checks[0].ok ? 2 : 3)}>
                ← Corregir
              </button>
              <button className="btn" disabled={testing || !accountId || !token} onClick={test}>
                🔌 Probar conexión
              </button>
            </div>
          )}
        </div>
      )}
    </div>
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
              🚀 Probar ahora (modo demo)
              <small>
                Sin configurar nada · {demo.limits?.image} imágenes y {demo.limits?.text} textos al día
              </small>
            </button>
          )}
          <button className={`btn big ${demo?.demo ? "ghost" : ""}`} onClick={onSetup}>
            ⚙️ Conectar mi cuenta gratis
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
