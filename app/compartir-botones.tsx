"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, Share2 } from "lucide-react";
import { aArchivo, archivoAlInstante, compartirArchivos, descargarArchivo } from "@/lib/compartir";
import { ErrorDrive, guardarEnDrive } from "@/lib/drive";
import { AVISO_CARGA, AVISO_VENTANA, enNavegadorDeApp, olvidarToken, pedirToken, precargarGoogle } from "@/lib/google-token";

const AVISO_DESCARGA =
  "Tu navegador no deja compartir este archivo: lo descargamos. Súbelo desde tu aparato a la red que quieras.";
const AVISO_TEXTO = "Se copió el texto para publicar: pégalo en la descripción.";
const AVISO_SIN_IMAGEN = "Todavía no hay imagen para compartir.";
const AVISO_OTRA_VEZ = "Toca otra vez para compartir.";
const AVISO_APP = "Abre Studio en Chrome o Safari para guardar en Google Drive.";
const ERROR_DRIVE = "No se pudo guardar en Google Drive.";
const CLAVE_CARPETA = "drive:carpeta";

// Pública (como la configuración de Firebase). Sin ella, el botón de Drive no aparece.
const ID_GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type Fuente = Blob | string;
type EstadoDrive =
  | { fase: "listo" }
  | { fase: "esperando" } // la ventana de Google está abierta
  | { fase: "preparando" } // ya hay permiso: carpeta y sesión de subida
  | { fase: "subiendo"; pct: number }
  | { fase: "hecho"; enlace: string }
  | { fase: "error"; mensaje: string };

function puedeCompartir(a: File): boolean {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [a] });
  } catch {
    return false;
  }
}

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
// `soloDrive`: solo el botón de Drive (donde ya hay un «Compartir» propio, como el editor de imágenes).
// `alSubir`: avisa si hay una subida a Drive en curso (para preguntar antes de cerrar la vista).
// Safari (iPhone) pierde el permiso de compartir o de abrir la ventana de Google si hay una espera
// entre el toque y esa acción: los Blob y data: se usan al instante; un enlace que hay que leer se lee
// en el primer toque y queda listo («Toca otra vez para compartir.» si el navegador perdió el permiso).
export default function CompartirBotones({
  src,
  nombre,
  texto,
  compacto,
  soloDrive,
  alSubir,
}: {
  src: Fuente | (() => Fuente | null);
  nombre: string;
  texto?: string;
  compacto?: boolean;
  soloDrive?: boolean;
  alSubir?: (activo: boolean) => void;
}) {
  const [preparando, setPreparando] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [enApp, setEnApp] = useState(false);
  // «espera»: el botón de Drive aún no se ve en pantalla (el script de Google no se carga todavía).
  const [google, setGoogle] = useState<"espera" | "cargando" | "listo" | "fallo">("espera");
  const [drive, setDrive] = useState<EstadoDrive>({ fase: "listo" });
  const ocupado = useRef(false);
  const subiendo = useRef(false);
  const cancelar = useRef<AbortController | null>(null);
  const preparado = useRef<{ src: Fuente; nombre: string; archivo: File } | null>(null);
  const botonDrive = useRef<HTMLButtonElement>(null);
  const avisarSubida = useRef(alSubir);
  avisarSubida.current = alSubir;

  const cargarGoogle = useCallback(() => {
    setGoogle("cargando");
    precargarGoogle().then(
      () => setGoogle("listo"),
      () => setGoogle("fallo"),
    );
  }, []);

  useEffect(() => {
    if (ID_GOOGLE) setEnApp(enNavegadorDeApp(navigator.userAgent));
  }, []);

  // El script de Google se carga solo cuando el botón de Drive aparece en pantalla (o recibe el foco).
  useEffect(() => {
    if (!ID_GOOGLE || enApp || google !== "espera") return;
    const b = botonDrive.current;
    if (!b || typeof IntersectionObserver === "undefined") {
      cargarGoogle();
      return;
    }
    const io = new IntersectionObserver((vistas) => {
      if (vistas.some((v) => v.isIntersecting)) {
        io.disconnect();
        cargarGoogle();
      }
    });
    io.observe(b);
    return () => io.disconnect();
  }, [enApp, google, cargarGoogle]);

  useEffect(() => () => cancelar.current?.abort(), []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (oculto) return null;

  // El archivo sin esperar: Blob, data: o uno ya leído antes. Los enlaces blob: o remotos se leen solo al tocar.
  function alInstante(fuente: Fuente): File | null {
    const p = preparado.current;
    if (p && p.src === fuente && p.nombre === nombre) return p.archivo;
    const a = archivoAlInstante(fuente, nombre);
    if (a && typeof src !== "function") preparado.current = { src: fuente, nombre, archivo: a };
    return a;
  }

  async function leer(fuente: Fuente): Promise<File | null> {
    const ya = alInstante(fuente);
    if (ya) return ya;
    const a = await aArchivo(fuente, nombre);
    if (a && typeof src !== "function") preparado.current = { src: fuente, nombre, archivo: a }; // listo para el próximo toque
    return a;
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
    setAviso("");
    try {
      let a = alInstante(fuente);
      const recienLeido = !a;
      if (!a) {
        setPreparando(true);
        a = await aArchivo(fuente, nombre);
        if (!a) {
          setOculto(true);
          return;
        }
        if (typeof src !== "function") preparado.current = { src: fuente, nombre, archivo: a };
      }
      const r = await compartirArchivos([a], texto);
      if (r === "descargar") {
        // Recién leído: el navegador sí puede compartir, pero perdió el permiso del toque mientras esperaba.
        if (recienLeido && puedeCompartir(a)) setAviso(AVISO_OTRA_VEZ);
        else {
          descargarArchivo(a);
          setAviso(AVISO_DESCARGA);
        }
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
      cargarGoogle();
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
    setDrive({ fase: "esperando" });
    avisarSubida.current?.(true);
    void subir(fuente, primerToken, control);
  }

  async function subir(fuente: Fuente, primerToken: Promise<string>, control: AbortController) {
    const conPermiso = (t: string) => {
      if (!control.signal.aborted) setDrive({ fase: "preparando" });
      return t;
    };
    try {
      const a = await leer(fuente);
      if (!a) {
        setOculto(true);
        return;
      }
      const hecho = await guardarEnDrive(a, nombre, {
        token: () => primerToken.then(conPermiso),
        tokenNuevo: () => {
          olvidarToken();
          setDrive({ fase: "esperando" });
          return pedirToken(ID_GOOGLE, { prompt: "" }).then(conPermiso);
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
      avisarSubida.current?.(false);
    }
  }

  const etiqueta = preparando ? "Preparando…" : "Compartir";
  const conDrive = !!ID_GOOGLE;
  const cargando = !enApp && (google === "espera" || google === "cargando");
  const driveOcupado = drive.fase === "subiendo" || drive.fase === "esperando" || drive.fase === "preparando" || cargando;
  const etiquetaDrive = cargando ? "Preparando…" : "Guardar en Drive";
  const alFoco = ID_GOOGLE && !enApp && google === "espera" ? cargarGoogle : undefined;

  return (
    <span className={`compartir${compacto ? " compacto" : ""}`} onFocus={alFoco}>
      {soloDrive ? null : compacto ? (
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
          <button ref={botonDrive} type="button" title={etiquetaDrive} aria-label={etiquetaDrive} disabled={driveOcupado} onClick={guardarDrive}>
            <CloudUpload size={17} aria-hidden />
          </button>
        ) : (
          <button ref={botonDrive} type="button" className="btn ghost small" disabled={driveOcupado} onClick={guardarDrive}>
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
          {(drive.fase === "esperando" || drive.fase === "preparando") && (
            <>
              <span className="drive-texto">{drive.fase === "esperando" ? "Esperando a Google…" : "Preparando Drive…"}</span>
              <button type="button" className="btn ghost small" onClick={() => cancelar.current?.abort()}>
                Cancelar
              </button>
            </>
          )}
          {drive.fase === "subiendo" && (
            <>
              {/* Hasta que Drive confirma el primer trozo no hay avance que mostrar: barra en movimiento. */}
              <span className="drive-texto">{drive.pct > 0 ? `Subiendo a Drive… ${drive.pct}%` : "Subiendo a Drive…"}</span>
              <span className={`drive-barra${drive.pct > 0 ? "" : " sin-avance"}`} aria-hidden>
                <span style={drive.pct > 0 ? { width: `${drive.pct}%` } : undefined} />
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
