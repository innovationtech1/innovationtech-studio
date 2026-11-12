"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import ReelStudio from "./reel-studio";
import { MAX_PROYECTOS, borrarProyecto, cambiarA, crearProyecto, leerProyectos, renombrarProyecto, videosDeOtros, type Proyecto } from "@/lib/proyectos";
import { deleteFile } from "@/lib/media-store";

type Props = Omit<ComponentProps<typeof ReelStudio>, "videosDeOtros" | "onOcupado">;
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
  const [aviso, setAviso] = useState("");
  // Lo que llegó de otras secciones antes de cambiar de video no se vuelve a aplicar al video nuevo
  const vistos = useRef({ h: -1, s: -1, t: -1 });

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

  // Hace un cambio de video: espera el guardado pendiente, aplica el cambio y vuelve a montar
  async function conCambio(fn: () => void) {
    if (cambiando || ocupado) return;
    setCambiando(true);
    setAviso("");
    setModo("");
    await new Promise((r) => setTimeout(r, ESPERA_GUARDADO));
    try {
      fn();
    } catch {
      setAviso("No se pudo guardar en este dispositivo. Libera espacio e intenta de nuevo.");
    }
    vistos.current = { h: props.handoff?.n ?? -1, s: props.sceneUpdate?.n ?? -1, t: props.incomingTopic?.n ?? -1 };
    refrescar();
    setVuelta((v) => v + 1);
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
      <ReelStudio
        key={vuelta}
        {...props}
        handoff={props.handoff && props.handoff.n !== vistos.current.h ? props.handoff : null}
        sceneUpdate={props.sceneUpdate && props.sceneUpdate.n !== vistos.current.s ? props.sceneUpdate : null}
        incomingTopic={props.incomingTopic && props.incomingTopic.n !== vistos.current.t ? props.incomingTopic : null}
        videosDeOtros={otros}
        onOcupado={setOcupado}
      />
    </>
  );
}
