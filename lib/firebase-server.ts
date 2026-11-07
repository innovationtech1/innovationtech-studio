import "server-only";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Conexión a Firestore desde el servidor (nunca desde el navegador).
// Las credenciales salen de .env.local (en la computadora) o de Netlify (en internet).

export function firestoreConfigurado(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export function db(): Firestore {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // En las variables de entorno los saltos de línea llegan como "\n"
        privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      }),
    });
  }
  // Siempre la base (default)
  return getFirestore();
}
