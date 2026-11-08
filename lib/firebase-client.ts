// Inicio de sesión con Firebase en el navegador. Solo para el navegador: nunca importar desde el servidor.
// Se carga con import() únicamente cuando las cuentas están encendidas (NEXT_PUBLIC_STUDIO_CUENTAS=on).

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getLang } from "./i18n";

export type { User };

let _auth: Auth | null = null;

// Crea la conexión la primera vez que se usa (inicio perezoso)
export function auth(): Auth {
  if (_auth) return _auth;
  const app: FirebaseApp =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  // La sesión se guarda en el navegador: al recargar la página se sigue dentro
  _auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Los correos de Firebase (confirmar correo, cambiar contraseña) en el idioma de la app
  _auth.languageCode = getLang();
  return _auth;
}

// ¿Es la app instalada en iPhone/iPad? Ahí las ventanas emergentes no funcionan bien.
function esAppIphone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const proveedorGoogle = () => {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return p;
};

export async function entrarConGoogle(): Promise<void> {
  const a = auth();
  if (esAppIphone()) return signInWithRedirect(a, proveedorGoogle());
  try {
    await signInWithPopup(a, proveedorGoogle());
  } catch (e) {
    const code = (e as { code?: string }).code;
    // El navegador bloqueó la ventana: se va a Google en la misma pestaña y vuelve
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      return signInWithRedirect(a, proveedorGoogle());
    }
    throw e;
  }
}

// Al volver de Google (inicio con redirección). Si no se usó redirección, no hace nada.
export async function resultadoRedireccion(): Promise<void> {
  await getRedirectResult(auth());
}

export async function entrarConCorreo(email: string, clave: string): Promise<void> {
  await signInWithEmailAndPassword(auth(), email.trim(), clave);
}

// Crea la cuenta y manda el correo para confirmarlo (se necesita para empezar la prueba gratis
// y para unirse a un equipo)
export async function crearConCorreo(email: string, clave: string): Promise<void> {
  const r = await createUserWithEmailAndPassword(auth(), email.trim(), clave);
  try {
    await sendEmailVerification(r.user);
  } catch {
    /* si falla el envío, se puede pedir de nuevo más tarde */
  }
}

export async function recuperarClave(email: string): Promise<void> {
  await sendPasswordResetEmail(auth(), email.trim());
}

export async function enviarVerificacion(): Promise<void> {
  const u = auth().currentUser;
  if (u) await sendEmailVerification(u);
}

// Vuelve a leer el usuario (por ejemplo, después de confirmar el correo) y renueva el token
export async function recargarUsuario(): Promise<void> {
  const u = auth().currentUser;
  if (!u) return;
  await u.reload();
  await u.getIdToken(true);
}

export async function salir(): Promise<void> {
  await signOut(auth());
}

export async function tokenActual(forzar: boolean): Promise<string | null> {
  const u = auth().currentUser;
  return u ? u.getIdToken(forzar) : null;
}

// Avisa cada vez que alguien entra o sale. Devuelve la función para dejar de escuchar.
export function alCambiarSesion(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(auth(), cb);
}
