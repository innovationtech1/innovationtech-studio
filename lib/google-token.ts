// Token de Google para «Guardar en Drive» (solo en el navegador, con Google Identity Services).
// El token vive solo en la memoria de esta página: no se guarda en el aparato, no va a nuestro
// servidor y nunca aparece en mensajes ni registros. Permiso: solo los archivos que Studio crea.
import { ErrorDrive } from "./drive";

/** Navegadores dentro de otras apps (Instagram, Facebook, TikTok, LINE): Google no deja iniciar sesión ahí. */
export function enNavegadorDeApp(ua: string): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Line\//.test(ua);
}

const SCRIPT = "https://accounts.google.com/gsi/client";
const ALCANCE = "https://www.googleapis.com/auth/drive.file";
const MARGEN_MS = 60_000; // se reusa el token mientras le queden más de 60 s

export const AVISO_VENTANA = "Google no pudo abrir su ventana. Revisa que no estén bloqueadas las ventanas emergentes.";
export const AVISO_CARGA = "No se pudo conectar con Google. Revisa tu conexión y vuelve a intentarlo.";

type RespuestaToken = { access_token?: string; expires_in?: number | string; scope?: string; error?: string };
type ClienteToken = { requestAccessToken: (o?: { prompt?: string }) => void };
type OAuth2 = {
  initTokenClient: (c: {
    client_id: string;
    scope: string;
    callback: (r: RespuestaToken) => void;
    error_callback: (e: { type?: string }) => void;
  }) => ClienteToken;
};

let carga: Promise<void> | null = null;
let cliente: { oauth2: OAuth2; id: string; c: ClienteToken } | null = null;
let guardado: { token: string; vence: number } | null = null;
let pendiente: { resolver: (t: string) => void; rechazar: (e: Error) => void } | null = null;

function oauth2(): OAuth2 | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { google?: { accounts?: { oauth2?: OAuth2 } } }).google?.accounts?.oauth2;
}

const cancelado = () => Object.assign(new Error("Cancelado"), { name: "AbortError" });

/** Carga el script de Google una sola vez. Se llama cuando aparece el botón, para no esperar en el toque. */
export function precargarGoogle(): Promise<void> {
  if (oauth2()) return Promise.resolve();
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.reject(new Error(AVISO_CARGA));
  if (!carga) {
    carga = new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => (oauth2() ? res() : rej(new Error(AVISO_CARGA)));
      s.onerror = () => {
        carga = null; // el próximo intento vuelve a probar
        s.remove();
        rej(new Error(AVISO_CARGA));
      };
      document.head.appendChild(s);
    });
  }
  return carga;
}

function alRecibir(r: RespuestaToken) {
  const p = pendiente;
  pendiente = null;
  if (r.error || !r.access_token) {
    p?.rechazar(new ErrorDrive(r.error === "access_denied" ? "PERMISO" : "OTRO"));
    return;
  }
  // Si la persona quitó la casilla de Drive en la pantalla de Google, el token no sirve para guardar.
  if (!(r.scope ?? "").split(" ").includes(ALCANCE)) {
    p?.rechazar(new ErrorDrive("PERMISO"));
    return;
  }
  guardado = { token: r.access_token, vence: Date.now() + Number(r.expires_in ?? 0) * 1000 };
  p?.resolver(r.access_token);
}

function alFallar(e: { type?: string }) {
  const p = pendiente;
  pendiente = null;
  if (!p) return;
  if (e.type === "popup_closed") p.rechazar(cancelado());
  else p.rechazar(new Error(AVISO_VENTANA));
}

/**
 * Devuelve un token con permiso `drive.file`. Si no hay uno vigente, abre la ventana de Google
 * en este mismo momento (sin esperas antes), así que debe llamarse directo dentro del toque.
 */
export function pedirToken(clientId: string, opciones?: { prompt?: "" | "consent" }): Promise<string> {
  if (guardado && guardado.vence - Date.now() > MARGEN_MS) return Promise.resolve(guardado.token);
  const o = oauth2();
  if (!o) return Promise.reject(new Error(AVISO_CARGA));
  if (!cliente || cliente.oauth2 !== o || cliente.id !== clientId) {
    cliente = {
      oauth2: o,
      id: clientId,
      c: o.initTokenClient({ client_id: clientId, scope: ALCANCE, callback: alRecibir, error_callback: alFallar }),
    };
  }
  pendiente?.rechazar(cancelado()); // solo una ventana a la vez
  const promesa = new Promise<string>((resolver, rechazar) => {
    pendiente = { resolver, rechazar };
  });
  cliente.c.requestAccessToken(opciones?.prompt !== undefined ? { prompt: opciones.prompt } : {});
  return promesa;
}

/** Borra el token de la memoria (p. ej. cuando Drive dice que venció). */
export function olvidarToken(): void {
  guardado = null;
}
