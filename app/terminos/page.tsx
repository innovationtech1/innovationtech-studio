import type { Metadata } from "next";
import LegalDoc from "../legal-doc";
import { TERMINOS } from "@/lib/legal";

// Términos de servicio: página estática, se abre sin iniciar sesión (Stripe la pide para el modo real).
export const metadata: Metadata = {
  title: "Términos de servicio · InnovationTECH Studio",
  description: "Términos de servicio de InnovationTECH Studio.",
};

export default function Terminos() {
  return <LegalDoc docs={TERMINOS} otro={{ href: "/privacidad", texto: "Política de privacidad" }} />;
}
