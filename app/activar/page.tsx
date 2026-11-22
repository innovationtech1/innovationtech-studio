import type { Metadata } from "next";
import ActivarTarjeta from "./activar-tarjeta";

// Activación de Studio con la tarjeta: página pública (la tarjeta trae el enlace a esta página).
export const metadata: Metadata = {
  title: "Activar con tarjeta · InnovationTECH Studio",
  description: "Activa InnovationTECH Studio con tu tarjeta: acércala al celular, escanea su código QR o escribe el código.",
};

export default function Activar() {
  return <ActivarTarjeta />;
}
