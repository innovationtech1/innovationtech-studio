import "server-only";
import { getAuth } from "firebase-admin/auth";
import { db } from "./firebase-server";

// Borra el inicio de sesión de una persona en Firebase (correo/contraseña o Google).
// Si ya no existía, no es un error.
export async function borrarAcceso(uid: string): Promise<void> {
  db(); // asegura que la conexión de administrador esté iniciada
  try {
    await getAuth().deleteUser(uid);
  } catch (e) {
    if ((e as { code?: string }).code === "auth/user-not-found") return;
    throw e;
  }
}
