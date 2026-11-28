"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Check,
  Copy,
  History,
  ImagePlus,
  MessageSquarePlus,
  PenLine,
  RefreshCw,
  Settings as IconoAjustes,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Brand, brandContext } from "@/lib/brand";
import type { CuentaNova } from "@/lib/nova";
import { friendlyError } from "@/lib/errors";
import { getLang, tr } from "@/lib/i18n";
import { usePersistentState } from "@/lib/persist";
import { phrases } from "@/lib/phrases";
import {
  SUGERENCIAS,
  debeSugerir,
  ideasDeImagen,
  siguienteSugerencia,
  sinIdeaAMedias,
  sinIdeasDeImagen,
  type Sugerencia,
} from "@/lib/nova-sugerencias";
import { FRASE_PRUEBA, crearVozNova, vocesNova, vozNova } from "@/lib/nova-voz";
import { ESTILOS_VOZ, aplicarEstilo, estiloVoz } from "@/lib/estilos-voz";
import type { Settings } from "@/lib/types";
import { useCuenta, type ValorCuenta } from "./account-context";
import MicButton from "./mic-button";
import NovaAvatar, { type EstadoNova } from "./nova-avatar";

// NOVA, la asistente de Studio, en forma de conversación (como un chat con Claude):
// recuerda lo que se habló, responde en tiempo real, se le pueden pedir cambios
// con un toque, se le puede hablar con el micrófono y, si el cliente se queda quieto,
// le sugiere algo (de una lista local, sin gastar IA). Con «NOVA habla» encendido lee en voz alta
// las sugerencias y cada respuesta, con su propia voz (Aura-2, ruta /api/nova/voz).

type Msg = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Msg[]; updated: number };

// Los 4 atajos de inicio. id = el atajo que recibe /api/chat para elegir el modelo (lib/nova.ts).
const ATAJOS = [
  {
    id: "comercial",
    texto: "Crear un comercial",
    mensaje: "Quiero crear un comercial. Pregúntame lo que necesites saber (mi negocio, el producto y la red social) y después escríbelo.",
  },
  { id: "ideas", texto: "Ideas para publicar", mensaje: "Dame ideas para publicar esta semana en las redes de mi negocio." },
  { id: "studio", texto: "¿Cómo uso Studio?", mensaje: "¿Cómo uso Studio? Explícame paso a paso qué puedo hacer y por dónde empiezo." },
  { id: "plan", texto: "Mi plan y mis límites", mensaje: "¿Qué plan tengo, cuánto me queda este mes y cuándo se reinicia?" },
];

// Ideas sugeridas que ya vio en esta visita (para no repetirlas)
const VISTAS_KEY = "nova:vistas";
function leerVistas(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(VISTAS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function guardarVistas(v: string[]) {
  try {
    sessionStorage.setItem(VISTAS_KEY, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
}

const QUICK = [
  "Hazlo más corto",
  "Más formal",
  "Más divertido",
  "Agrega emojis",
  "Dame 3 variantes",
  "Tradúcelo al inglés",
];

const newId = () => Math.random().toString(36).slice(2, 10);
const titleOf = (t: string) => (t.length > 48 ? t.slice(0, 46).trimEnd() + "…" : t);
// Los datos del plan que ya tiene la app (sin lecturas extra), para que NOVA los conozca.
// Con las cuentas apagadas o sin negocio: null (NOVA dice que no ve el plan).
function cuentaParaNova({ activo, cuenta }: ValorCuenta): CuentaNova | null {
  if (!activo || !cuenta || !cuenta.usuario || !("negocio" in cuenta)) return null;
  return {
    plan: cuenta.efectivo.plan ?? "sin_plan",
    estado: cuenta.efectivo.estado,
    limites: cuenta.limites,
    uso: cuenta.uso,
    saldo: cuenta.saldo as Record<string, number>,
    reinicio: cuenta.reinicio,
    precios: cuenta.precios,
    paquetes: cuenta.paquetes.map((p) => ({ id: p.id, monto: p.monto, contenido: p.contenido as Record<string, number> })),
    esDueno: cuenta.esDueno,
    herramientas: cuenta.herramientas,
    tomasPorDia: cuenta.tomasPorDia,
  };
}

const stripPrompt = sinIdeasDeImagen;

export default function AssistantChat({
  settings,
  brand,
  onImage,
  onEditor,
  seccion,
}: {
  settings: Settings;
  brand: Brand;
  onImage: (prompt: string) => void;
  onEditor: (text: string) => void;
  seccion?: string; // dónde está la persona cuando el chat flota sobre otra sección (lib/nova-flotante.ts)
}) {
  const valorCuenta = useCuenta();
  const [chats, setChats] = usePersistentState<Chat[]>("chat:conversaciones", []);
  const [currentId, setCurrentId] = usePersistentState("chat:actual", "");
  const [input, setInput] = usePersistentState("chat:borrador", "");
  const [interim, setInterim] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null); // la respuesta que se está escuchando
  const [copied, setCopied] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [micActivo, setMicActivo] = useState(false); // dictando: escuchando, grabando o transcribiendo
  // Ajustes de NOVA (recordados en el aparato): voz, estilo de voz, «NOVA habla» (apagado al inicio) y sugerencias
  const [vozId, setVozId] = usePersistentState("nova:voz", "");
  const [estiloGuardado, setEstilo] = usePersistentState<string>("nova:estilo", "natural");
  const [habla, setHabla] = usePersistentState("nova:habla", false);
  const [sugerenciasOn, setSugerenciasOn] = usePersistentState("nova:sugerencias", true);
  const [ajustes, setAjustes] = useState(false);
  const [vozSonando, setVozSonando] = useState(false);
  const [probando, setProbando] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const ultimaActividad = useRef(Date.now());
  const ultimaSugerencia = useRef(0);
  const interactuo = useRef(false); // tocó o escribió algo en esta visita (antes, NOVA no habla sola)

  const chat = chats.find((c) => c.id === currentId) || null;
  const messages = useMemo(() => chat?.messages || [], [chat]);
  const cfHeaders = { "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken };

  // Bajar al último mensaje mientras llega la respuesta
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ---------- La voz de NOVA ----------
  const lang = getLang();
  const vozElegida = vozNova(vozId, lang);
  const estilo = estiloVoz(estiloGuardado);
  const vozActual = useRef({ cfHeaders, voz: vozElegida.id, habla, estilo });
  useEffect(() => {
    vozActual.current = { cfHeaders, voz: vozElegida.id, habla, estilo };
  });
  const leyendoSugerencia = useRef(false); // lo que suena es una sugerencia (se calla si apagan Sugerencias)
  const vozPrueba = useRef<string | null>(null); // la voz de «Probar» (si no, la elegida)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const terminar = useRef<(() => void) | null>(null); // termina el audio o la voz del aparato que suena
  const vozRef = useRef<ReturnType<typeof crearVozNova> | null>(null);
  const voz = () =>
    (vozRef.current ??= crearVozNova({
      pedir: async (text, signal) => {
        const { cfHeaders: h, voz: elegida, estilo: e } = vozActual.current;
        const res = await fetch("/api/nova/voz", {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", ...h },
          body: JSON.stringify({ text, lang: getLang(), voice: vozPrueba.current ?? elegida }),
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        // El estilo se hace en el aparato, mientras suena el trozo anterior (si falla, suena sin estilo)
        const bruto = await res.blob();
        return e === "natural" ? bruto : aplicarEstilo(await bruto.arrayBuffer(), e);
      },
      reproducir: (b) =>
        new Promise<void>((resolve, reject) => {
          const url = URL.createObjectURL(b);
          const a = new Audio(url);
          audioRef.current = a;
          const fin = (e?: unknown) => {
            a.onended = a.onerror = null;
            URL.revokeObjectURL(url);
            // solo se limpia si sigue siendo el audio actual (no borra el «terminar» de uno nuevo)
            if (audioRef.current === a) {
              audioRef.current = null;
              terminar.current = null;
            }
            if (e) reject(e);
            else resolve();
          };
          terminar.current = () => fin();
          a.onended = () => fin();
          a.onerror = () => fin(new Error("audio"));
          a.play().catch((e) => fin(e || new Error("audio")));
        }),
      // Si el audio no llega: la voz del aparato
      respaldo: (t) =>
        new Promise<void>((resolve) => {
          const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
          if (!synth) return resolve();
          const u = new SpeechSynthesisUtterance(t);
          u.lang = getLang() === "en" ? "en-US" : "es-MX";
          const fin = () => {
            if (terminar.current === fin) terminar.current = null;
            resolve();
          };
          terminar.current = fin;
          u.onend = fin;
          u.onerror = fin;
          synth.speak(u);
        }),
      detener: () => {
        audioRef.current?.pause();
        window.speechSynthesis?.cancel();
        terminar.current?.();
      },
      alCambiar: (h) => {
        setVozSonando(h);
        if (!h) {
          leyendoSugerencia.current = false;
          setSpeaking(null);
          setProbando(null);
          vozPrueba.current = null;
        }
      },
    }));
  // Lo nuevo reemplaza lo que sonaba (y las marcas de «Escuchar» o «Probar» de antes)
  const hablar = (texto: string, prueba: string | null = null) => {
    setSpeaking(null);
    setProbando(null);
    vozPrueba.current = prueba;
    leyendoSugerencia.current = false;
    voz().decir(texto);
  };
  const callar = () => vozRef.current?.callar();
  // Callar al salir y al cambiar de pestaña o esconder la app
  useEffect(() => {
    const oculto = () => document.hidden && vozRef.current?.callar();
    document.addEventListener("visibilitychange", oculto);
    return () => {
      document.removeEventListener("visibilitychange", oculto);
      vozRef.current?.callar();
    };
  }, []);

  // Lo último de la pantalla, para revisarlo cada 5 s sin reiniciar el reloj en cada cambio
  const ahora = useRef({ streaming, input, interim, micActivo, sugerencia, sugerenciasOn, cuenta: cuentaParaNova(valorCuenta), marca: brand.name || "" });
  useEffect(() => {
    ahora.current = { streaming, input, interim, micActivo, sugerencia, sugerenciasOn, cuenta: cuentaParaNova(valorCuenta), marca: brand.name || "" };
  });

  // Sugerencias cuando el cliente lleva 45 s sin hacer nada con NOVA a la vista (máx. 1 cada 3 min)
  useEffect(() => {
    const actividad = (e: Event) => {
      ultimaActividad.current = Date.now();
      if (e.type !== "scroll") interactuo.current = true;
    };
    const eventos = ["keydown", "pointerdown", "scroll"] as const;
    for (const e of eventos) window.addEventListener(e, actividad, { passive: true, capture: true });
    const reloj = window.setInterval(() => {
      const a = ahora.current;
      if (a.sugerencia || !a.sugerenciasOn) return;
      const t = Date.now();
      const visible = document.visibilityState === "visible" && !!sectionRef.current && sectionRef.current.offsetParent !== null;
      const ok = debeSugerir({
        inactivoMs: t - ultimaActividad.current,
        desdeUltimaMs: t - ultimaSugerencia.current,
        escribiendo: a.micActivo || !!a.interim,
        transmitiendo: a.streaming,
        visible,
        textoEnCaja: !!a.input.trim(),
      });
      if (!ok) return;
      const lista = SUGERENCIAS(a.cuenta, a.marca);
      const vistas = leerVistas();
      const s = siguienteSugerencia(lista, vistas);
      if (!s) return;
      // si ya las vio todas, se vuelve a empezar la cuenta
      const todas = lista.every((x) => vistas.includes(x.id));
      guardarVistas(todas ? [s.id] : [...vistas, s.id]);
      ultimaSugerencia.current = t;
      setSugerencia(s);
      // Con «NOVA habla», la lee en voz alta (nunca antes de que el cliente haya tocado algo en esta visita)
      // y nunca interrumpe una respuesta que esté sonando
      if (vozActual.current.habla && interactuo.current && !vozRef.current?.hablando()) {
        hablar(tr(s.texto));
        leyendoSugerencia.current = true;
      }
    }, 5000);
    return () => {
      window.clearInterval(reloj);
      for (const e of eventos) window.removeEventListener(e, actividad, { capture: true });
    };
  }, []);

  const saveMessages = (id: string, msgs: Msg[], title?: string) =>
    setChats((all) => {
      const exists = all.some((c) => c.id === id);
      const next = exists
        ? all.map((c) => (c.id === id ? { ...c, messages: msgs, updated: Date.now(), title: title || c.title } : c))
        : [{ id, title: title || "Conversación", messages: msgs, updated: Date.now() }, ...all];
      return next.sort((a, b) => b.updated - a.updated).slice(0, 30);
    });

  // atajo: el botón de inicio que lo pidió («studio», «plan», «comercial», «ideas»), para elegir el modelo
  async function send(text: string, base?: Msg[], atajo?: string) {
    const content = text.trim();
    if (!content || streaming) return;
    ultimaActividad.current = Date.now();
    callar(); // una respuesta nueva: lo que estaba sonando se calla
    setSugerencia(null);
    setError("");
    setPicker(null);
    const id = currentId && chat ? currentId : newId();
    if (id !== currentId) setCurrentId(id);
    const history: Msg[] = [...(base ?? messages), { role: "user", content }];
    const title = base ?? messages.length ? undefined : titleOf(content);
    saveMessages(id, [...history, { role: "assistant", content: "" }], title);
    setInput("");
    setStreaming(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let out = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ctrl.signal,
        headers:
          settings.textProvider === "cloudflare"
            ? { "content-type": "application/json", ...cfHeaders }
            : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey },
        body: JSON.stringify({
          messages: history,
          brand: brandContext(brand),
          provider: settings.textProvider,
          model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
          nova: { cuenta: cuentaParaNova(valorCuenta), ...(atajo ? { atajo } : {}), ...(seccion ? { seccion } : {}) },
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
        saveMessages(id, [...history, { role: "assistant", content: out }]);
      }
      if (!out.trim()) throw new Error("La IA no respondió. Intenta de nuevo.");
      if (vozActual.current.habla && !document.hidden) hablar(out);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        if (!out.trim()) saveMessages(id, history);
      } else {
        saveMessages(id, out.trim() ? [...history, { role: "assistant", content: out }] : history);
        setError(friendlyError((e as Error).message));
      }
    } finally {
      setStreaming(false);
      abort.current = null;
    }
  }

  const regenerate = () => {
    const lastUser = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUser < 0) return;
    const idx = messages.length - 1 - lastUser;
    send(messages[idx].content, messages.slice(0, idx));
  };

  const newChat = () => {
    abort.current?.abort();
    callar();
    setCurrentId("");
    setError("");
    setShowHistory(false);
    inputRef.current?.focus();
  };

  // «Escuchar» de cada respuesta: con la misma voz de NOVA (tocar otra vez la detiene)
  const speak = (i: number, text: string) => {
    if (speaking === i) return callar();
    hablar(text);
    if (vozRef.current?.hablando()) setSpeaking(i); // sin nada que leer no queda marcado
  };

  // «Probar» de Ajustes de NOVA: una frase corta con esa voz
  const probar = (id: string) => {
    if (probando === id) return callar();
    hablar(FRASE_PRUEBA[lang], id);
    if (vozRef.current?.hablando()) setProbando(id);
  };

  const copy = (i: number, text: string) => {
    navigator.clipboard.writeText(stripPrompt(text)).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1500);
  };

  const lastAssistant = messages.length && messages[messages.length - 1].role === "assistant" ? messages.length - 1 : -1;
  // pensando: esperando la primera letra; hablando: llegando la respuesta; aviso: trae una sugerencia
  const esperando = streaming && !(messages[messages.length - 1]?.content);
  const estadoNova: EstadoNova = esperando ? "pensando" : streaming || vozSonando ? "hablando" : sugerencia ? "aviso" : "quieta";

  return (
    <section className="card chat-card" ref={sectionRef}>
      <div className="card-head nova-head">
        <div className="nova-id">
          <NovaAvatar estado={estadoNova} tamano={44} />
          <div>
            <h2>NOVA</h2>
            <p className="nova-online">
              <span className="nova-dot" aria-hidden /> En línea · tu asistente de Studio
            </p>
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost small" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <History size={16} aria-hidden /> Conversaciones
          </button>
          <button className="btn ghost small" onClick={newChat}>
            <MessageSquarePlus size={16} aria-hidden /> Nueva
          </button>
          <button
            className="btn ghost small nova-engrane"
            onClick={() => setAjustes((v) => !v)}
            aria-expanded={ajustes}
            title="Ajustes de NOVA"
            aria-label="Ajustes de NOVA"
          >
            <IconoAjustes size={16} aria-hidden />
          </button>
        </div>
      </div>

      {ajustes && (
        <div className="nova-ajustes" role="group" aria-label="Ajustes de NOVA">
          <h3>Ajustes de NOVA</h3>
          <label className="nova-interruptor">
            <input
              type="checkbox"
              checked={habla}
              onChange={(e) => {
                setHabla(e.target.checked);
                if (!e.target.checked) callar();
              }}
            />
            <span>
              <strong>NOVA habla</strong>
              <span className="muted">Lee en voz alta sus sugerencias y cada respuesta.</span>
            </span>
          </label>
          <label className="nova-interruptor">
            <input
              type="checkbox"
              checked={sugerenciasOn}
              onChange={(e) => {
                setSugerenciasOn(e.target.checked);
                if (!e.target.checked) {
                  setSugerencia(null);
                  if (leyendoSugerencia.current) callar();
                }
              }}
            />
            <span>
              <strong>Sugerencias</strong>
              <span className="muted">Ideas cuando llevas un rato sin escribir.</span>
            </span>
          </label>
          <label className="nova-estilo">
            <span className="muted">Estilo de voz</span>
            <select value={estilo} onChange={(e) => setEstilo(estiloVoz(e.target.value))}>
              {ESTILOS_VOZ.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
            <span className="muted">{ESTILOS_VOZ.find((x) => x.id === estilo)!.descripcion}</span>
          </label>
          <p className="muted nova-ajustes-voz">Voz de NOVA</p>
          <div className="nova-voces">
            {vocesNova(lang).map((v) => {
              const on = vozElegida.id === v.id;
              return (
                <div key={v.id} className={`nova-voz ${on ? "on" : ""}`}>
                  <button className="nova-voz-elegir" onClick={() => setVozId(v.id)} aria-pressed={on}>
                    <strong data-no-translate>{v.name}</strong>
                    <span className="muted">
                      {v.gender === "mujer" ? "Mujer" : "Hombre"}
                      {v.lang === "es" ? ` · ${v.accent}` : ""}
                    </span>
                  </button>
                  <button className="nova-voz-probar" onClick={() => probar(v.id)} aria-label={probando === v.id ? "Detener" : `Probar a ${v.name}`}>
                    {probando === v.id ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
                    {probando === v.id ? "Detener" : "Probar"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sugerencia && (
        <div className="nova-burbuja" role="status">
          <p>{sugerencia.texto}</p>
          <div className="nova-burbuja-acciones">
            <button className="btn small" onClick={() => send(tr(sugerencia.mensaje), undefined, sugerencia.atajo)}>
              Hazlo
            </button>
            <button className="icon-only" onClick={() => setSugerencia(null)} title="Cerrar sugerencia" aria-label="Cerrar sugerencia">
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="chat-history">
          {chats.length === 0 && <p className="muted">Aún no tienes conversaciones guardadas.</p>}
          {chats.map((c) => (
            <div key={c.id} className={`chat-history-row ${c.id === currentId ? "active" : ""}`}>
              <button onClick={() => (setCurrentId(c.id), setShowHistory(false), setError(""))}>
                <strong>{c.title}</strong>
                <span className="muted">{new Date(c.updated).toLocaleDateString(getLang() === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short" })}</span>
              </button>
              <button
                className="icon-only"
                title="Borrar conversación"
                aria-label="Borrar conversación"
                onClick={() => {
                  setChats((all) => all.filter((x) => x.id !== c.id));
                  if (c.id === currentId) setCurrentId("");
                }}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p className="chat-hello">{brand.name ? `Hola, ${brand.name}. ¿Qué creamos hoy?` : "Hola. ¿Qué creamos hoy?"}</p>
            <p className="muted">Soy NOVA. Te ayudo con textos, ideas y con cómo usar Studio. Escribe o toca el micrófono para hablar.</p>
            <div className="chat-suggestions nova-atajos">
              {ATAJOS.map((a) => (
                <button key={a.id} onClick={() => send(tr(a.mensaje), undefined, a.id)}>
                  {a.texto}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="msg user" data-no-translate>
                {m.content}
              </div>
            ) : (
              <div key={i} className="msg assistant">
                <div className="msg-body" data-no-translate>
                  {m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streaming && i === messages.length - 1 ? sinIdeaAMedias(m.content) : stripPrompt(m.content)}
                    </ReactMarkdown>
                  ) : (
                    <span className="typing" aria-label="Escribiendo">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  {streaming && i === messages.length - 1 && m.content && <span className="caret" aria-hidden />}
                </div>
                {m.content && !(streaming && i === messages.length - 1) && (
                  <div className="msg-actions">
                    <button onClick={() => copy(i, m.content)} title="Copiar">
                      {copied === i ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                      {copied === i ? "Copiado" : "Copiar"}
                    </button>
                    <button onClick={() => speak(i, m.content)} title="Leer en voz alta">
                      {speaking === i ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
                      {speaking === i ? "Detener" : "Escuchar"}
                    </button>
                    <button onClick={() => setPicker(picker === i ? null : i)}>
                      <PenLine size={15} aria-hidden /> Llevar al editor
                    </button>
                    {i === lastAssistant && (
                      <button onClick={regenerate}>
                        <RefreshCw size={15} aria-hidden /> Otra respuesta
                      </button>
                    )}
                  </div>
                )}
                {m.content && !(streaming && i === messages.length - 1) && ideasDeImagen(m.content).length > 0 && (
                  <div className="nova-ideas">
                    <p className="muted">Ideas de imagen</p>
                    {ideasDeImagen(m.content).map((idea, k) => (
                      <div key={k} className="nova-idea">
                        <span data-no-translate>{idea}</span>
                        <button onClick={() => onImage(idea)}>
                          <ImagePlus size={15} aria-hidden /> Crear esta imagen
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {picker === i && (
                  <div className="phrase-pick">
                    <p className="muted">Elige la frase que quieres poner en tu diseño:</p>
                    {phrases(stripPrompt(m.content)).map((ph) => (
                      <button key={ph} data-no-translate onClick={() => (onEditor(ph), setPicker(null))}>
                        {ph}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )
        )}
      </div>

      {error && (
        <div className="error">
          {error}{" "}
          <button className="btn ghost small" onClick={regenerate} style={{ marginTop: 6 }}>
            Intentar otra vez
          </button>
        </div>
      )}

      {lastAssistant >= 0 && !streaming && (
        <div className="chat-quick">
          <Sparkles size={15} aria-hidden />
          {QUICK.map((q) => (
            <button key={q} onClick={() => send(tr(q))}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={inputRef}
          value={interim ? `${input}${input && !input.endsWith(" ") ? " " : ""}${interim}` : input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Escribe o dicta tu mensaje…"
          aria-label="Tu mensaje"
        />
        <div className="composer-actions">
          <MicButton
            cfHeaders={cfHeaders}
            disabled={streaming}
            onActive={(v) => {
              setMicActivo(v);
              ultimaActividad.current = Date.now(); // tocar el micrófono cuenta como actividad
            }}
            onInterim={setInterim}
            onText={(t) => setInput((v) => (v && !v.endsWith(" ") ? `${v} ${t}` : v + t))}
          />
          {streaming ? (
            <button type="button" className="send-btn stop" onClick={() => abort.current?.abort()} title="Detener" aria-label="Detener">
              <Square size={14} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button type="submit" className="send-btn" disabled={!input.trim()} title="Enviar" aria-label="Enviar">
              <ArrowUp size={18} aria-hidden />
            </button>
          )}
        </div>
      </form>
      <p className="muted chat-foot">Enter para enviar · Shift+Enter para otra línea. La IA puede equivocarse: revisa antes de publicar.</p>
    </section>
  );
}
