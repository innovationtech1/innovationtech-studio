import type { Metadata } from "next";
import LegalDoc from "../legal-doc";
import { PRIVACIDAD } from "@/lib/legal";

// Política de privacidad: página estática, se abre sin iniciar sesión (Stripe la pide para el modo real).
export const metadata: Metadata = {
  title: "Política de privacidad · InnovationTECH Studio",
  description: "Política de privacidad de InnovationTECH Studio.",
};

export default function Privacidad() {
  return <LegalDoc docs={PRIVACIDAD} otro={{ href: "/terminos", texto: "Términos de servicio" }} />;
}
