"use client";

// «Crear video con NOVA»: el camino guiado de la pestaña Videos. Cuatro pasos (fotos, de qué trata,
// qué se ve en cada foto, armar) con NOVA diciendo qué hacer en cada uno. Las reglas viven en
// lib/video-guiado.ts; aquí solo se pinta. Al armar, las fotos entran al editor por el mismo camino que
// «Secuencia de fotos», y ahí NOVA escribe el guion y graba la voz (tarjeta «Video de NOVA»).

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Clapperboard, ImagePlus, Images, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { tr } from "@/lib/i18n";
import { usePersistentState } from "@/lib/persist";
import type { ReelFormat } from "@/lib/reel";
import { dataUrlReducida, fileToResizedDataUrl } from "@/lib/resize";
import { MAX_FOTOS } from "@/lib/secuencia";
import { quedanDe } from "@/lib/secuencia-pantalla";
import type { Item, Settings } from "@/lib/types";
import {
  GUIADO_VACIO,
  MAX_LINEA_GUIADA,
  MAX_TEMA_GUIADO,
  PASOS_GUIADO,
  aSecuencia,
  agregarFotos,
  alternarAnimar,
  avanzar,
  faltaPara,
  limpiarTextoGuiado,
  mensajeNova,
  moverFoto,
  quitarFoto,
  regresar,
  type EstadoGuiado,
  type FotoGuiada,
} from "@/lib/video-guiado";
import { useCuenta } from "./account-context";
import MicButton from "./mic-button";
import NovaAvatar from "./nova-avatar";
import type { SecuenciaParaVideo } from "./secuencia-fotos";

const LADO_FOTO = 1280; // las fotos se achican en el teléfono antes de guardarse en memoria
const FORMATOS: { id: ReelFormat; nombre: string }[] = [
  { id: "9:16", nombre: "Vertical (Reels, TikTok)" },
  { id: "1:1", nombre: "Cuadrado (publicación)" },
  { id: "16:9", nombre: "Horizontal (YouTube)" },
];
const TITULOS = ["Tus fotos", "De qué trata", "Qué se ve en cada foto", "Tu video"];

let cuenta = 0;
const idFoto = () => `g${Date.now().toString(36)}-${++cuenta}`;

type Resto = Omit<EstadoGuiado, "tema" | "formato">;
const RESTO_VACIO: Resto = { paso: 1, fotos: [], lineas: {}, animar: [] };

export default function VideoGuiado({
  settings,
  gallery,
  onArmar,
  onEditor,
}: {
  settings: Settings;
  gallery: Item[];
  onArmar: (s: SecuenciaParaVideo) => void; // entrega las fotos al editor (el mismo camino que la secuencia)
  onEditor: () => void; // abre el editor avanzado sin armar nada
}) {
  // El tema y el formato se guardan en el aparato; las fotos solo viven mientras la app está abierta
  const [texto, setTexto] = usePersistentState<{ tema: string; formato: ReelFormat }>("guiado:texto", { tema: "", formato: "9:16" });
  const [resto, setResto] = useState<Resto>(RESTO_VACIO);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [sobraron, setSobraron] = useState(0);
  const [galeria, setGaleria] = useState(false);
  const [intento, setIntento] = useState(false); // ya tocó «Siguiente»: se muestra lo que falta

  const estado: EstadoGuiado = { ...resto, ...limpiarTextoGuiado(texto) };
  const cambiar = (fn: (e: EstadoGuiado) => EstadoGuiado) => {
    const { tema, formato, ...r } = fn(estado);
    setResto(r);
    if (tema !== estado.tema || formato !== estado.formato) setTexto({ tema, formato });
  };

  const { activo, cuenta: datos } = useCuenta();
  const tomasQuedan = activo && datos && "limites" in datos ? quedanDe(datos, "tomas_ia") : undefined;
  const cfHeaders = { "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken };
  const falta = faltaPara(estado);
  const imagenes = gallery.filter((g) => g.kind === "imagen");

  function meter(nuevas: FotoGuiada[], fallaron: number) {
    const r = agregarFotos(estado, nuevas);
    setResto(({ paso, lineas, animar }) => ({ paso, lineas, animar, fotos: r.estado.fotos }));
    setSobraron(r.sobraron);
    setAviso(fallaron > 0 ? (fallaron === 1 ? "No pude leer 1 foto. Las demás ya están." : `No pude leer ${fallaron} fotos. Las demás ya están.`) : "");
    setIntento(false);
  }

  // Una foto que no se puede leer no detiene a las demás
  async function subir(archivos: File[]) {
    if (!archivos.length || ocupado) return;
    setOcupado(true);
    const nuevas: FotoGuiada[] = [];
    let fallaron = 0;
    for (const f of archivos.slice(0, MAX_FOTOS * 2)) {
      try {
        nuevas.push({ id: idFoto(), src: await fileToResizedDataUrl(f, LADO_FOTO) });
      } catch {
        fallaron++;
      }
    }
    meter(nuevas, fallaron);
    setOcupado(false);
  }

  async function deGaleria(g: Item) {
    if (ocupado) return;
    setOcupado(true);
    try {
      meter([{ id: idFoto(), src: await dataUrlReducida(g.url, LADO_FOTO) }], 0);
    } catch {
      meter([], 1);
    }
    setOcupado(false);
  }

  function siguiente() {
    if (falta) return setIntento(true);
    setIntento(false);
    setAviso("");
    setSobraron(0);
    setGaleria(false);
    cambiar(avanzar);
  }

  function armar() {
    onArmar(aSecuencia(estado));
    cambiar((e) => ({ ...e, paso: 4 })); // las fotos se conservan aquí por si el editor no las tomó
  }

  function empezarDeNuevo() {
    const hay = estado.fotos.length > 0 || !!estado.tema.trim();
    if (hay && !confirm(tr("¿Empezar de nuevo? Se quitan las fotos y lo que escribiste."))) return;
    setResto(RESTO_VACIO);
    setTexto({ tema: "", formato: estado.formato });
    setAviso("");
    setSobraron(0);
    setIntento(false);
    setGaleria(false);
  }

  return (
    <section className="card guiado">
      <div className="guiado-nova" role="status" aria-live="polite">
        <NovaAvatar estado={ocupado ? "pensando" : "hablando"} tamano={44} />
        <p>{mensajeNova(estado, { tomasQuedan, sobraron })}</p>
      </div>
      <p className="guiado-paso">
        <span data-no-translate>
          {tr("Paso")} {estado.paso} {tr("de")} {PASOS_GUIADO}
        </span>
        <strong>{TITULOS[estado.paso - 1]}</strong>
      </p>
      <div className="guiado-barra" aria-hidden>
        {TITULOS.map((_, i) => (
          <span key={i} className={i < estado.paso ? "hecho" : ""} />
        ))}
      </div>

      {estado.paso === 1 && (
        <>
          <div className="actions">
            <label className={`btn${ocupado ? " disabled" : ""}`} style={{ margin: 0 }}>
              {ocupado ? <Loader2 size={16} className="spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />} Subir fotos
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={ocupado}
                onChange={(e) => {
                  const lista = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void subir(lista);
                }}
              />
            </label>
            <button className="btn ghost" disabled={ocupado} onClick={() => setGaleria((v) => !v)} aria-expanded={galeria}>
              <Images size={16} aria-hidden /> Elegir de mi galería
            </button>
          </div>
          {galeria && (
            <div className="picker">
              {imagenes.length === 0 && <span className="muted">Tu galería está vacía.</span>}
              {imagenes.slice(0, 24).map((g, k) => (
                <button key={g.url + k} className="pick-item" disabled={ocupado} onClick={() => void deGaleria(g)} aria-label={tr("Agregar esta foto")}>
                  <img src={g.url} alt="" />
                </button>
              ))}
            </div>
          )}
          <p className="muted">
            <span data-no-translate>
              {estado.fotos.length} / {MAX_FOTOS}
            </span>{" "}
            fotos. Saldrán en este orden.
          </p>
          <ol className="guiado-fotos">
            {estado.fotos.map((f, i) => (
              <li key={f.id}>
                <img src={f.src} alt={`${tr("Foto")} ${i + 1}`} />
                <span className="guiado-num" data-no-translate>
                  {i + 1}
                </span>
                <span className="guiado-mover">
                  <button className="btn ghost small" disabled={ocupado || i === 0} onClick={() => cambiar((e) => moverFoto(e, f.id, -1))} aria-label={tr("Mover antes")}>
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button className="btn ghost small" disabled={ocupado || i === estado.fotos.length - 1} onClick={() => cambiar((e) => moverFoto(e, f.id, 1))} aria-label={tr("Mover después")}>
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button className="btn ghost small" disabled={ocupado} onClick={() => cambiar((e) => quitarFoto(e, f.id))} aria-label={tr("Quitar foto")}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {estado.paso === 2 && (
        <>
          <label htmlFor="guiado-tema">De qué trata tu video</label>
          <div className="guiado-tema">
            <textarea
              id="guiado-tema"
              rows={3}
              maxLength={MAX_TEMA_GUIADO}
              value={estado.tema}
              placeholder={tr("Ejemplo: promoción de tortas 2x1 todos los martes")}
              onChange={(e) => cambiar((x) => ({ ...x, tema: e.target.value }))}
            />
            <MicButton cfHeaders={cfHeaders} onText={(t) => cambiar((x) => ({ ...x, tema: `${x.tema} ${t}`.trim().slice(0, MAX_TEMA_GUIADO) }))} />
          </div>
          <label id="guiado-formato">Para dónde es</label>
          <div className="seg" role="radiogroup" aria-labelledby="guiado-formato">
            {FORMATOS.map((f) => (
              <button key={f.id} role="radio" aria-checked={estado.formato === f.id} className={estado.formato === f.id ? "active" : ""} onClick={() => cambiar((x) => ({ ...x, formato: f.id }))}>
                {f.nombre}
              </button>
            ))}
          </div>
        </>
      )}

      {estado.paso === 3 && (
        <ol className="guiado-lineas">
          {estado.fotos.map((f, i) => (
            <li key={f.id}>
              <img src={f.src} alt={`${tr("Foto")} ${i + 1}`} />
              <div>
                <label htmlFor={`linea-${f.id}`}>
                  <span data-no-translate>{i + 1}.</span> Qué se ve en esta foto
                </label>
                <input
                  id={`linea-${f.id}`}
                  type="text"
                  maxLength={MAX_LINEA_GUIADA}
                  value={estado.lineas[f.id] ?? ""}
                  placeholder={tr("Ejemplo: la torta recién hecha")}
                  onChange={(e) => cambiar((x) => ({ ...x, lineas: { ...x.lineas, [f.id]: e.target.value } }))}
                />
                <label className="guiado-animar">
                  <input
                    type="checkbox"
                    checked={estado.animar.includes(f.id)}
                    disabled={!estado.animar.includes(f.id) && tomasQuedan !== undefined && estado.animar.length >= tomasQuedan}
                    onChange={() => cambiar((x) => alternarAnimar(x, f.id, tomasQuedan))}
                  />
                  <Sparkles size={14} aria-hidden /> Animar con IA
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}

      {estado.paso === 4 && (
        <div className="guiado-listo">
          <p>Tus fotos ya están en el editor. Ahí NOVA escribe el guion y graba la voz, y puedes cambiar lo que quieras.</p>
          <div className="actions">
            <button className="btn" onClick={onEditor}>
              <Clapperboard size={16} aria-hidden /> Ir al editor
            </button>
            <button className="btn ghost" onClick={armar}>
              Enviar las fotos otra vez
            </button>
          </div>
        </div>
      )}

      {aviso && <p className="notice">{aviso}</p>}
      {intento && falta && (
        <p className="error" role="alert">
          {falta}
        </p>
      )}

      <div className="guiado-pie">
        {estado.paso > 1 && (
          <button className="btn ghost" onClick={() => (setIntento(false), cambiar(regresar))}>
            <ArrowLeft size={16} aria-hidden /> Atrás
          </button>
        )}
        {estado.paso < 3 && (
          <button className="btn" disabled={ocupado} onClick={siguiente}>
            Siguiente <ArrowRight size={16} aria-hidden />
          </button>
        )}
        {estado.paso === 3 && (
          <button className="btn" onClick={armar}>
            <Clapperboard size={16} aria-hidden /> Armar mi video
          </button>
        )}
        <button className="btn ghost small guiado-reinicio" onClick={empezarDeNuevo}>
          <RotateCcw size={14} aria-hidden /> Empezar de nuevo
        </button>
      </div>
    </section>
  );
}
