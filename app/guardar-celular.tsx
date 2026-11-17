"use client";

import { useEffect, useState } from "react";
import { CLAVE_GUARDAR_CELULAR, guardarCelularEncendido, nombreArchivoCamara } from "@/lib/camara";

// Deja una copia de la foto o el video en la memoria del celular (carpeta de descargas del navegador).
// `origen` es el archivo (Blob) o una foto en data URL.
export function guardarEnCelular(tipo: "foto" | "video", origen: Blob | string) {
  const esBlob = typeof origen !== "string";
  const url = esBlob ? URL.createObjectURL(origen) : origen;
  const mime = esBlob ? origen.type : origen.slice(5, origen.indexOf(";"));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoCamara(tipo, mime, new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (esBlob) setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// La casilla de las dos cámaras; lo elegido se recuerda en este dispositivo.
export function usarGuardarCelular() {
  const [encendido, setEncendido] = useState(true);
  useEffect(() => {
    try {
      setEncendido(guardarCelularEncendido(localStorage.getItem(CLAVE_GUARDAR_CELULAR)));
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  function cambiar(v: boolean) {
    setEncendido(v);
    try {
      localStorage.setItem(CLAVE_GUARDAR_CELULAR, v ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
  }
  return { encendido, cambiar };
}

export function CasillaGuardarCelular({ encendido, onCambiar, bloqueado }: { encendido: boolean; onCambiar: (v: boolean) => void; bloqueado?: boolean }) {
  return (
    <label className="camara-casilla">
      <input type="checkbox" checked={encendido} disabled={bloqueado} onChange={(e) => onCambiar(e.target.checked)} />
      Guardar también en la memoria del celular
    </label>
  );
}
