"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, Share2 } from "lucide-react";
import { aArchivo, compartirArchivos, descargarArchivo } from "@/lib/compartir";
import { ErrorDrive, guardarEnDrive } from "@/lib/drive";
import { AVISO_CARGA, AVISO_VENTANA, enNavegadorDeApp, olvidarToken, pedirToken, precargarGoogle } from "@/lib/google-token";

const AVISO_DESCARGA =
  "Tu navegador no deja compartir este archivo: lo descargamos. Súbelo desde tu aparato a la red que quieras.";
const AVISO_TEXTO = "Se copió el texto para publicar: pégalo en la descripción.";
const AVISO_SIN_IMAGEN = "Todavía no hay imagen para compartir.";
const AVISO_APP = "Abre Studio en Chrome o Safari para guardar en Google Drive.";
const ERROR_DRIVE = "No se pudo guardar en Google Drive.";
const CLAVE_CARPETA = "drive:carpeta";

// Pública (como la configuración de Firebase). Sin ella, el botón de Drive no aparece.
const ID_GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type Fuente = Blob | string;
type EstadoDrive =
  | { fase: "listo" }
  | { fase: "subiendo"; pct: number }
  | { fase: "hecho"; enlace: string }
  | { fase: "error"; mensaje: string };

const esRemota = (s: Fuente) => typeof s === "string" && /^https?:/i.test(s);

function leerCarpeta(): string | null {
  try {
    return localStorage.getItem(CLAVE_CARPETA);
  } catch {
    return null;
  }
}
function guardarCarpeta(id: string) {
  try {
    localStorage.setItem(CLAVE_CARPETA, id);
  } catch {
    // Sin almacenamiento (modo privado): la próxima vez se busca la carpeta otra vez.
  }
}

// Solo mensajes conocidos llegan a la pantalla: nunca el texto crudo de un error (podría traer datos técnicos).
function mensajeDe(e: unknown): string {
  if (e instanceof ErrorDrive) return e.message;
  if (e instanceof Error && (e.message === AVISO_VENTANA || e.message === AVISO_CARGA)) return e.message;
  return ERROR_DRIVE;
}

// «Compartir» y «Guardar en Drive» junto a cada «Descargar».
// Compartir abre el menú del teléfono o de la computadora con el archivo; si el navegador no puede,
// lo descarga y lo explica. Drive sube el archivo directo del aparato al Google Drive de la persona.
// Si el archivo no se deja leer (p. ej. un enlace remoto protegido), los botones se ocultan y queda
// solo «Descargar». `src` puede ser una función cuando el archivo se arma en el momento del toque.
// El archivo se prepara antes del toque: Safari (iPhone) pierde el permiso de compartir o de abrir
// la ventana de Google si se espera una descarga entre el toque y esa acción.
export default function CompartirBotones({
  src,
  nombre,
  texto,
  compacto,
}: {
  src: Fuente | (() => Fuente | null);
  nombre: string;
  texto?: string;
  compacto?: boolean;
}) {
  const [preparando, setPreparando] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enApp, setEnApp] = useState(false);
  const [google, setGoogle] = useState<"cargando" | "listo" | "fallo">("cargando");
  const [drive, setDrive] = useState<EstadoDrive>({ fase: "listo" });
  const ocupado = useRef(false);
  const subiendo = useRef(false);
  const cancelar = useRef<AbortController | null>(null);
  const previo = useRef<Promise<File | null> | null>(null);

  const fija = typeof src === "function" ? null : src;

  // Prepara el archivo una sola vez por fuente.
  const precargar = useCallback((): Promise<File | null> | null => {
    if (!fija) return null;
    if (previo.current) return previo.current;
    const p = aArchivo(fija, nombre);
    previo.current = p;
    p.then((a) => {
      if (previo.current !== p) return;
      if (a) setArchivo(a);
      else setOculto(true);
    });
    return p;
  }, [fija, nombre]);

  useEffect(() => {
    previo.current = null;
    setArchivo(null);
    setOculto(false);
    // En la galería no se descargan todos los enlaces remotos al abrirla: se preparan al acercarse al botón.
    if (fija && !(compacto && esRemota(fija))) precargar();
  }, [fija, compacto, precargar]);

  useEffect(() => {
    if (!ID_GOOGLE) return;
    const app = enNavegadorDeApp(navigator.userAgent);
    setEnApp(app);
    if (app) return;
    let vivo = true;
    precargarGoogle().then(
      () => vivo && setGoogle("listo"),
      () => vivo && setGoogle("fallo"),
    );
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => () => cancelar.current?.abort(), []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (oculto) return null;

  // Archivo listo si ya se preparó; si no, se espera (para `src` función se arma ahora).
  async function obtenerArchivo(fuente: Fuente): Promise<File | null> {
    if (typeof src !== "function") return archivo ?? (await (precargar() ?? aArchivo(fuente, nombre)));
    return aArchivo(fuente, nombre);
  }

  function fuenteDelToque(): Fuente | null {
    const fuente = typeof src === "function" ? src() : src;
    if (!fuente) setAviso(AVISO_SIN_IMAGEN);
    return fuente;
  }

  async function compartir() {
    if (ocupado.current) return;
    const fuente = fuenteDelToque();
    if (!fuente) return;
    ocupado.current = true;
    setPreparando(true);
    setAviso("");
    try {
      const a = await obtenerArchivo(fuente);
      if (!a) {
        setOculto(true);
        return;
      }
      const r = await compartirArchivos([a], texto);
      if (r === "descargar") {
        descargarArchivo(a);
        setAviso(AVISO_DESCARGA);
      } else if (r === "compartido" && texto) setAviso(AVISO_TEXTO);
    } finally {
      ocupado.current = false;
      setPreparando(false);
    }
  }

  function guardarDrive() {
    if (subiendo.current) return; // dos toques seguidos: una sola subida
    if (enApp) {
      setDrive({ fase: "error", mensaje: AVISO_APP });
      return;
    }
    if (google === "fallo") {
      setDrive({ fase: "error", mensaje: AVISO_CARGA });
      setGoogle("cargando");
      precargarGoogle().then(
        () => setGoogle("listo"),
        () => setGoogle("fallo"),
      );
      return;
    }
    if (google !== "listo") return;
    const fuente = fuenteDelToque();
    if (!fuente) return;
    subiendo.current = true;
    // La ventana de Google se abre aquí mismo, antes de cualquier espera.
    const primerToken = pedirToken(ID_GOOGLE);
    primerToken.catch(() => {}); // si algo falla antes de usarlo, no queda una promesa sin atender
    const control = new AbortController();
    cancelar.current = control;
    setAviso("");
    setDrive({ fase: "subiendo", pct: 0 });
    void subir(fuente, primerToken, control);
  }

  async function subir(fuente: Fuente, primerToken: Promise<string>, control: AbortController) {
    try {
      const a = await obtenerArchivo(fuente);
      if (!a) {
        setOculto(true);
        return;
      }
      const hecho = await guardarEnDrive(a, nombre, {
        token: () => primerToken,
        tokenNuevo: () => {
          olvidarToken();
          return pedirToken(ID_GOOGLE, { prompt: "" });
        },
        f: (url, init) => fetch(url, init),
        carpetaGuardada: leerCarpeta(),
        guardarCarpeta,
        alProgreso: (pct) => !control.signal.aborted && setDrive({ fase: "subiendo", pct }),
        senal: control.signal,
      });
      setDrive({ fase: "hecho", enlace: hecho.webViewLink });
    } catch (e) {
      if (e instanceof ErrorDrive && e.codigo === "TOKEN") olvidarToken();
      if (e instanceof Error && e.name === "AbortError") setDrive({ fase: "listo" });
      else setDrive({ fase: "error", mensaje: mensajeDe(e) });
    } finally {
      if (cancelar.current === control) cancelar.current = null;
      subiendo.current = false;
    }
  }

  const etiqueta = preparando ? "Preparando…" : "Compartir";
  const conDrive = !!ID_GOOGLE;
  const driveOcupado = drive.fase === "subiendo" || (!enApp && google === "cargando");
  const etiquetaDrive = !enApp && google === "cargando" ? "Preparando…" : "Guardar en Drive";
  // En la galería, el ícono prepara el enlace remoto en cuanto el dedo o el ratón se acerca.
  const acercar = fija && compacto && esRemota(fija) ? () => void precargar() : undefined;

  return (
    <span className={`compartir${compacto ? " compacto" : ""}`} onPointerEnter={acercar} onFocus={acercar}>
      {compacto ? (
        <button type="button" title={etiqueta} aria-label={etiqueta} disabled={preparando} onClick={compartir}>
          <Share2 size={17} aria-hidden />
        </button>
      ) : (
        <button type="button" className="btn ghost small" disabled={preparando} onClick={compartir}>
          <Share2 size={15} aria-hidden /> {etiqueta}
        </button>
      )}
      {conDrive &&
        (compacto ? (
          <button type="button" title={etiquetaDrive} aria-label={etiquetaDrive} disabled={driveOcupado} onClick={guardarDrive}>
            <CloudUpload size={17} aria-hidden />
          </button>
        ) : (
          <button type="button" className="btn ghost small" disabled={driveOcupado} onClick={guardarDrive}>
            <CloudUpload size={15} aria-hidden /> {etiquetaDrive}
          </button>
        ))}
      {aviso && (
        <span className="notice compartir-aviso" role="status">
          {aviso}
        </span>
      )}
      {drive.fase !== "listo" && (
        <span className="notice compartir-aviso drive-estado" role="status">
          {drive.fase === "subiendo" && (
            <>
              <span className="drive-texto">{`Subiendo a Drive… ${drive.pct}%`}</span>
              <span className="drive-barra" aria-hidden>
                <span style={{ width: `${drive.pct}%` }} />
              </span>
              <button type="button" className="btn ghost small" onClick={() => cancelar.current?.abort()}>
                Cancelar
              </button>
            </>
          )}
          {drive.fase === "hecho" && (
            <>
              <span className="drive-texto">Guardado en Drive</span>
              {drive.enlace && (
                <a className="btn ghost small" href={drive.enlace} target="_blank" rel="noreferrer">
                  Abrir en Drive
                </a>
              )}
              <button type="button" className="btn ghost small" onClick={() => setDrive({ fase: "listo" })}>
                Cerrar
              </button>
            </>
          )}
          {drive.fase === "error" && (
            <>
              <span className="drive-texto">{drive.mensaje}</span>
              {drive.mensaje !== AVISO_APP && (
                <button type="button" className="btn ghost small" onClick={guardarDrive}>
                  Reintentar
                </button>
              )}
              <button type="button" className="btn ghost small" onClick={() => setDrive({ fase: "listo" })}>
                Cerrar
              </button>
            </>
          )}
        </span>
      )}
    </span>
  );
}
