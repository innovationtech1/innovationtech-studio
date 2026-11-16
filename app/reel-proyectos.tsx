"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { tr } from "@/lib/i18n";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import ReelStudio from "./reel-studio";
import { MAX_PROYECTOS, borrarProyecto, cambiarA, crearProyecto, leerProyectos, renombrarProyecto, videosDeOtros, type Proyecto } from "@/lib/proyectos";
import { deleteFile } from "@/lib/media-store";
import { decidirEntrada, limpiarEntrante, tieneContenido, type SecuenciaEntrante } from "@/lib/secuencia-video";

type Props = Omit<ComponentProps<typeof ReelStudio>, "videosDeOtros" | "onOcupado" | "onSubiendoDrive">;
// Lo que se escribe se guarda con una pequeña pausa: antes de cambiar de video se espera a que termine
const ESPERA_GUARDADO = 450;

// Varios videos guardados en el dispositivo. Esta barra elige cuál está abierto; el Creador de Reels
// se vuelve a montar con los datos de ese video.
export default function ReelProyectos(props: Props) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [activo, setActivo] = useState("");
  const [vuelta, setVuelta] = useState(0); // cambia al abrir otro video: vuelve a montar el Creador de Reels
  const [otros, setOtros] = useState<string[]>([]);
  const [modo, setModo] = useState<"" | "renombrar" | "borrar">("");
  const [nombre, setNombre] = useState("");
  const [cambiando, setCambiando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const subiendoDrive = useRef(false); // cambiar de video quita el Creador de Reels y corta la subida a Drive
  const [aviso, setAviso] = useState("");
  // Lo que llegó de otras secciones antes de cambiar de video no se vuelve a aplicar al video nuevo
  const vistos = useRef({ h: -1, s: -1, t: -1 });
  // «Hacer el video con NOVA»: la secuencia que va al Creador de Reels (ya decidido en qué video) y la pregunta
  // «¿Reemplazo el video abierto o creo uno nuevo?» cuando el abierto ya tiene algo
  const [entrante, setEntrante] = useState<SecuenciaEntrante | null>(null);
  const [pregunta, setPregunta] = useState<{ s: SecuenciaEntrante; puedeNuevo: boolean } | null>(null);
  const secuenciaVista = useRef(-1);

  const refrescar = () => {
    try {
      const g = leerProyectos(localStorage);
      setProyectos(g.proyectos);
      setActivo(g.activo);
      setOtros(videosDeOtros(localStorage));
    } catch {
      /* sin almacenamiento: se trabaja con un solo video */
    }
  };
  useEffect(refrescar, []);

  useEffect(() => {
    const s = limpiarEntrante(props.incomingSecuencia);
    if (!s || secuenciaVista.current === s.n) return;
    secuenciaVista.current = s.n;
    let hay = true; // sin poder leer lo guardado, se pregunta (no se reemplaza nada sin avisar)
    let cuantos = 0;
    try {
      const leer = (k: string) => JSON.parse(localStorage.getItem(`its-draft:reel:${k}`) ?? "null");
      hay = tieneContenido(leer("escenas-datos"), leer("guion"));
      cuantos = leerProyectos(localStorage).proyectos.length;
    } catch {
      /* sin almacenamiento */
    }
    const d = decidirEntrada({ hayContenido: hay, proyectos: cuantos, max: MAX_PROYECTOS });
    if (!d.preguntar) {
      setPregunta(null);
      setEntrante(s);
    } else setPregunta({ s, puedeNuevo: d.puedeNuevo });
  }, [props.incomingSecuencia]);

  // Hace un cambio de video: espera el guardado pendiente, aplica el cambio y vuelve a montar
  // Con `secuencia`, el video que se abre la recibe (si fn no devuelve false)
  async function conCambio(fn: () => void | boolean, secuencia?: SecuenciaEntrante) {
    if (cambiando || ocupado) return;
    const cortaDrive = subiendoDrive.current;
    if (cortaDrive && !confirm(tr("La subida a Drive sigue en curso. ¿Cancelarla?"))) return;
    setCambiando(true);
    setAviso("");
    setModo("");
    await new Promise((r) => setTimeout(r, ESPERA_GUARDADO));
    let ok = true;
    try {
      ok = fn() !== false;
    } catch {
      ok = false;
      setAviso("No se pudo guardar en este dispositivo. Libera espacio e intenta de nuevo.");
    }
    setEntrante(ok && secuencia ? secuencia : null); // cambiar de video no vuelve a cargar una secuencia vieja
    vistos.current = { h: props.handoff?.n ?? -1, s: props.sceneUpdate?.n ?? -1, t: props.incomingTopic?.n ?? -1 };
    refrescar();
    setVuelta((v) => v + 1);
    if (cortaDrive) setAviso("Se canceló la subida a Drive.");
    setCambiando(false);
  }

  const abrir = (id: string) => conCambio(() => void cambiarA(localStorage, id));
  const nuevo = () =>
    conCambio(() => {
      const r = crearProyecto(localStorage);
      if (!r.ok) setAviso(r.error);
    });
  const borrar = () =>
    conCambio(() => {
      const { archivos } = borrarProyecto(localStorage, activo);
      archivos.forEach((id) => void deleteFile(id).catch(() => {}));
    });
  function renombrar() {
    try {
      renombrarProyecto(localStorage, activo, nombre);
    } catch {
      /* sin almacenamiento */
    }
    setModo("");
    refrescar();
  }

  // Respuesta a «¿Reemplazo el video abierto o creo uno nuevo?»
  function nuevoConSecuencia() {
    if (!pregunta) return;
    const { s } = pregunta;
    setPregunta(null);
    void conCambio(() => {
      const r = crearProyecto(localStorage, s.tema);
      if (!r.ok) {
        setAviso(r.error);
        return false;
      }
    }, s);
  }
  function reemplazarConSecuencia() {
    if (!pregunta) return;
    setEntrante(pregunta.s);
    setPregunta(null);
  }

  const actual = proyectos.find((p) => p.id === activo);
  const bloqueado = cambiando || ocupado;

  return (
    <>
      {proyectos.length > 0 && (
        <div className="proy">
          {modo === "renombrar" ? (
            <>
              <input value={nombre} maxLength={40} autoFocus aria-label="Nombre del video" onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renombrar()} />
              <button className="btn small" disabled={!nombre.trim()} onClick={renombrar}>
                Guardar nombre
              </button>
              <button className="btn ghost small" onClick={() => setModo("")}>
                Cancelar
              </button>
            </>
          ) : modo === "borrar" ? (
            <>
              <p className="proy-aviso">{`¿Borrar «${actual?.nombre ?? ""}»? Se borran sus fotos y videos de este dispositivo. Los videos ya creados siguen en tu galería.`}</p>
              <button className="btn small" disabled={bloqueado} onClick={borrar}>
                Sí, borrar
              </button>
              <button className="btn ghost small" onClick={() => setModo("")}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <select value={activo} disabled={bloqueado} aria-label="Mis videos guardados" onChange={(e) => abrir(e.target.value)}>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <button className="btn ghost small" disabled={bloqueado || proyectos.length >= MAX_PROYECTOS} onClick={nuevo} title={proyectos.length >= MAX_PROYECTOS ? `Máximo ${MAX_PROYECTOS} videos guardados` : undefined}>
                <FolderPlus size={15} aria-hidden /> Nuevo
              </button>
              <button className="btn ghost small proy-icono" disabled={bloqueado} title="Renombrar" aria-label="Renombrar" onClick={() => (setNombre(actual?.nombre ?? ""), setModo("renombrar"))}>
                <Pencil size={16} aria-hidden />
              </button>
              <button className="btn ghost small proy-icono" disabled={bloqueado} title="Borrar este video" aria-label="Borrar este video" onClick={() => setModo("borrar")}>
                <Trash2 size={16} aria-hidden />
              </button>
            </>
          )}
          {aviso && <div className="error proy-aviso">{aviso}</div>}
        </div>
      )}
      {pregunta && (
        <div className="notice" role="alertdialog" aria-label="¿Reemplazo el video abierto o creo uno nuevo?">
          <p style={{ margin: "0 0 8px" }}>¿Reemplazo el video abierto o creo uno nuevo?</p>
          {!pregunta.puedeNuevo && proyectos.length >= MAX_PROYECTOS && (
            <p className="muted" style={{ margin: "0 0 8px" }}>{`Ya tienes ${MAX_PROYECTOS} videos guardados: solo se puede reemplazar el abierto (o borra alguno).`}</p>
          )}
          <div className="actions">
            {pregunta.puedeNuevo && (
              <button className="btn small" disabled={bloqueado} onClick={nuevoConSecuencia}>
                <FolderPlus size={15} aria-hidden /> Crear uno nuevo
              </button>
            )}
            <button className={pregunta.puedeNuevo ? "btn ghost small" : "btn small"} disabled={bloqueado} onClick={reemplazarConSecuencia}>
              Reemplazar
            </button>
            <button className="btn ghost small" onClick={() => setPregunta(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <ReelStudio
        key={vuelta}
        {...props}
        handoff={props.handoff && props.handoff.n !== vistos.current.h ? props.handoff : null}
        sceneUpdate={props.sceneUpdate && props.sceneUpdate.n !== vistos.current.s ? props.sceneUpdate : null}
        incomingTopic={props.incomingTopic && props.incomingTopic.n !== vistos.current.t ? props.incomingTopic : null}
        incomingSecuencia={entrante}
        videosDeOtros={otros}
        onOcupado={setOcupado}
        onSubiendoDrive={(activo) => (subiendoDrive.current = activo)}
      />
    </>
  );
}
