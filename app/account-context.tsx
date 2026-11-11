"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import type { EstadoCuenta } from "@/lib/account-api";
import type { Herramienta } from "@/lib/plans";
import { esRutaPublica } from "@/lib/rutas-publicas";

// Estado de la cuenta que comparte AccountGate con el resto de la app.
// Este archivo no carga Firebase: page.tsx lo puede importar aunque las cuentas estén apagadas.

export const CUENTAS_ON = process.env.NEXT_PUBLIC_STUDIO_CUENTAS === "on";

// La puerta de las cuentas (AccountGate) se descarga aparte, solo cuando se usa:
// con las cuentas apagadas ni su código ni Firebase llegan al navegador.
const AccountGate = dynamic(() => import("./account-gate"), {
  loading: () => <div className="acct-pantalla" />,
});
// Los Términos y la Privacidad se muestran sin la puerta: se leen sin iniciar sesión y sin cargar Firebase.
export function CuentasRaiz({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (esRutaPublica(pathname)) return <>{children}</>;
  return <AccountGate>{children}</AccountGate>;
}

export type Cuenta = EstadoCuenta;
export type CuentaConNegocio = Extract<EstadoCuenta, { negocio: unknown }>;

export type ValorCuenta = {
  // true solo dentro de AccountGate (cuentas encendidas)
  activo: boolean;
  cargando: boolean;
  cuenta: Cuenta | null;
  refrescar: () => Promise<void>;
  abrirMiCuenta: () => void;
  abrirPlanes: () => void;
};

const nada = async () => {};

export const ContextoCuenta = createContext<ValorCuenta>({
  activo: false,
  cargando: false,
  cuenta: null,
  refrescar: nada,
  abrirMiCuenta: () => {},
  abrirPlanes: () => {},
});

export function useCuenta(): ValorCuenta {
  return useContext(ContextoCuenta);
}

// Para quien no está dentro de React (por ejemplo, un manejador de errores): vuelve a leer la cuenta.
let refrescoActual: () => Promise<void> = nada;
export function registrarRefresco(f: () => Promise<void>): () => void {
  refrescoActual = f;
  return () => {
    if (refrescoActual === f) refrescoActual = nada;
  };
}
export function refrescarCuenta(): Promise<void> {
  return refrescoActual();
}

// ¿Puede usar esta herramienta? Con las cuentas apagadas, siempre sí.
// soloPro: además pide el plan Pro (el video de Replicate: las tomas con IA sí son de todos los planes).
export function usePuede(h: Herramienta, soloPro = false): boolean {
  const { activo, cuenta } = useCuenta();
  if (!activo || !cuenta || !cuenta.usuario) return true;
  if (soloPro && cuenta.efectivo?.plan !== "pro") return false;
  // Con saldo del paquete Video, el Creador de Reels es suyo aunque el plan sea Básico
  if (h === "reels" && (cuenta.saldo.tomas_ia ?? 0) > 0) return true;
  return cuenta.herramientas.includes(h);
}

// Etiqueta «Pro» junto al nombre de una herramienta que el plan no incluye
export function ProTag({ h, soloPro }: { h: Herramienta; soloPro?: boolean }) {
  const puede = usePuede(h, soloPro);
  if (puede) return null;
  return (
    <>
      {" "}
      <span className="acct-pro">Pro</span>
    </>
  );
}

// Aviso con «Mejorar a Pro» encima de una herramienta que el plan no incluye
export function MejorarPro({ h, soloPro }: { h: Herramienta; soloPro?: boolean }) {
  const puede = usePuede(h, soloPro);
  const { abrirPlanes } = useCuenta();
  if (puede) return null;
  return (
    <div className="acct-upsell">
      <span>
        <span className="acct-pro">Pro</span> Esta herramienta es del plan Pro.
      </span>
      <button className="btn small" onClick={abrirPlanes}>
        Mejorar a Pro
      </button>
    </div>
  );
}

// Botón «Mi cuenta» para el menú de la app (solo con cuentas encendidas)
export function BotonCuenta() {
  const { activo, abrirMiCuenta } = useCuenta();
  if (!activo) return null;
  return (
    <button className="acct-btn" onClick={abrirMiCuenta} title="Mi cuenta">
      <UserRound size={16} aria-hidden />
      <span>Mi cuenta</span>
    </button>
  );
}

// «Demo a la vista»: el Creador de Reels avisa que está generando o mostrando el video del demo gratis.
// Mientras esté así, si la prueba vence no se tapa la pantalla con «Elige un plan»: el cliente ve su video.
// (El servidor igual deja de aceptar pedidos nuevos cuando la prueba termina.)
let demoALaVista = false;
const oyentesDemo = new Set<() => void>();
export function marcarDemoALaVista(v: boolean): void {
  if (demoALaVista === v) return;
  demoALaVista = v;
  oyentesDemo.forEach((f) => f());
}
export function useDemoALaVista(): boolean {
  return useSyncExternalStore(
    (f) => (oyentesDemo.add(f), () => oyentesDemo.delete(f)),
    () => demoALaVista,
    () => false,
  );
}
