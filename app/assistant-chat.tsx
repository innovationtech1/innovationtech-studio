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
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Brand, brandContext } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { getLang, tr } from "@/lib/i18n";
import { usePersistentState } from "@/lib/persist";
import { extract, phrases } from "@/lib/phrases";
import type { Settings } from "@/lib/types";
import MicButton from "./mic-button";

// Asistente de marketing en forma de conversación (como un chat con Claude):
// recuerda lo que se habló, responde en tiempo real, se le pueden pedir cambios
// con un toque y se le puede hablar con el micrófono.

type Msg = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Msg[]; updated: number };

const SUGGESTIONS = [
  "Escribe un post para Instagram que promocione mi negocio esta semana",
  "Dame 5 ideas de contenido para mis redes de esta semana",
  "Crea el guion de un reel de 30 segundos para mi producto estrella",
  "Escribe la descripción para mi perfil de Instagram",
  "Ayúdame a responder con amabilidad a un cliente molesto",
  "Escribe un anuncio corto para Facebook con llamada a la acción",
];

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
const stripPrompt = (t: string) => t.replace(/\n?\**PROMPT DE IMAGEN:?\**.*$/im, "").trim();

export default function AssistantChat({
  settings,
  brand,
  onImage,
  onEditor,
}: {
  settings: Settings;
  brand: Brand;
  onImage: (prompt: string) => void;
  onEditor: (text: string) => void;
}) {
  const [chats, setChats] = usePersistentState<Chat[]>("chat:conversaciones", []);
  const [currentId, setCurrentId] = usePersistentState("chat:actual", "");
  const [input, setInput] = usePersistentState("chat:borrador", "");
  const [interim, setInterim] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chat = chats.find((c) => c.id === currentId) || null;
  const messages = useMemo(() => chat?.messages || [], [chat]);
  const cfHeaders = { "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken };

  // Bajar al último mensaje mientras llega la respuesta
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  // Detener la lectura en voz alta al salir
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const saveMessages = (id: string, msgs: Msg[], title?: string) =>
    setChats((all) => {
      const exists = all.some((c) => c.id === id);
      const next = exists
        ? all.map((c) => (c.id === id ? { ...c, messages: msgs, updated: Date.now(), title: title || c.title } : c))
        : [{ id, title: title || "Conversación", messages: msgs, updated: Date.now() }, ...all];
      return next.sort((a, b) => b.updated - a.updated).slice(0, 30);
    });

  async function send(text: string, base?: Msg[]) {
    const content = text.trim();
    if (!content || streaming) return;
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
    window.speechSynthesis?.cancel();
    setCurrentId("");
    setError("");
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const speak = (i: number, text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking === i) {
      synth.cancel();
      setSpeaking(null);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(stripPrompt(text).replace(/[*#_`>|-]/g, " "));
    u.lang = getLang() === "en" ? "en-US" : "es-MX";
    u.onend = () => setSpeaking(null);
    u.onerror = () => setSpeaking(null);
    setSpeaking(i);
    synth.speak(u);
  };

  const copy = (i: number, text: string) => {
    navigator.clipboard.writeText(stripPrompt(text)).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1500);
  };

  const lastAssistant = messages.length && messages[messages.length - 1].role === "assistant" ? messages.length - 1 : -1;

  return (
    <section className="card chat-card">
      <div className="card-head">
        <h2>Asistente</h2>
        <div className="actions">
          <button className="btn ghost small" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <History size={16} aria-hidden /> Conversaciones
          </button>
          <button className="btn ghost small" onClick={newChat}>
            <MessageSquarePlus size={16} aria-hidden /> Nueva
          </button>
        </div>
      </div>

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
            <p className="chat-hello">{`Hola${brand.name ? `, equipo de ${brand.name}` : ""}. ¿Qué contenido creamos hoy?`}</p>
            <p className="muted">Escribe o toca el micrófono para hablar. Puedes pedirme cambios cuantas veces quieras.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(tr(s))}>
                  {s}
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripPrompt(m.content)}</ReactMarkdown>
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
                    {extract(m.content, "PROMPT DE IMAGEN") && (
                      <button onClick={() => onImage(extract(m.content, "PROMPT DE IMAGEN"))}>
                        <ImagePlus size={15} aria-hidden /> Crear la imagen
                      </button>
                    )}
                    {i === lastAssistant && (
                      <button onClick={regenerate}>
                        <RefreshCw size={15} aria-hidden /> Otra respuesta
                      </button>
                    )}
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
