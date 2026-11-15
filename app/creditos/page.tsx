import type { Metadata } from "next";
import LegalDoc from "../legal-doc";
import { CREDITOS } from "@/lib/creditos";

// Créditos y licencias: página estática y pública. Varias licencias piden que el reconocimiento esté a la vista.
export const metadata: Metadata = {
  title: "Créditos y licencias · InnovationTECH Studio",
  description: "Música, sonidos, tipografías, modelos y código abierto que usa InnovationTECH Studio.",
};

export default function Creditos() {
  return <LegalDoc docs={CREDITOS} otro={{ href: "/terminos", texto: "Términos de servicio" }} />;
}
