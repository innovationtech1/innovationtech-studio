"use client";
import { useEffect } from "react";
import { destinoFijo } from "@/lib/enlace-fijo";

// Quien abre un enlace temporal de Netlify se manda a la dirección fija (ahí sí funciona Google).
export default function EnlaceFijo() {
  useEffect(() => {
    const destino = destinoFijo(window.location, process.env.NEXT_PUBLIC_DIRECCION_FIJA ?? "");
    if (destino) window.location.replace(destino);
  }, []);
  return null;
}
