"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Play, Square } from "lucide-react";
import { getLang } from "@/lib/i18n";
import { SAMPLE, Voice, VOICES } from "@/lib/voices";

// Selector de voz: cada voz se puede escuchar antes de elegirla.
// Las muestras se guardan en memoria para no gastar uso gratis al repetirlas.
const samples = new Map<string, string>();

export default function VoicePicker({
  value,
  onChange,
  headers,
}: {
  value: string;
  onChange: (id: string) => void;
  headers: Record<string, string>;
}) {
  const lang = getLang();
  const [filter, setFilter] = useState<"todas" | "mujer" | "hombre">("todas");
  const [loading, setLoading] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  const list = VOICES.filter((v) => v.lang === lang && (filter === "todas" || v.gender === filter || v.basic));

  const stop = () => {
    audio.current?.pause();
    setPlaying(null);
  };

  async function listen(v: Voice) {
    setError("");
    if (playing === v.id) return stop();
    stop();
    let src = samples.get(v.id);
    if (!src) {
      setLoading(v.id);
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ text: SAMPLE[lang], lang, voice: v.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        src = data.audio as string;
        samples.set(v.id, src);
      } catch (e) {
        setError((e as Error).message);
        return;
      } finally {
        setLoading(null);
      }
    }
    const a = new Audio(src);
    audio.current = a;
    a.onended = () => setPlaying(null);
    setPlaying(v.id);
    a.play().catch(() => setPlaying(null));
  }

  return (
    <div className="voice-picker">
      <div className="seg">
        {(["todas", "mujer", "hombre"] as const).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f === "todas" ? "Todas" : f === "mujer" ? "Mujer" : "Hombre"}
          </button>
        ))}
      </div>
      <div className="voice-grid">
        {list.map((v) => {
          const on = value === v.id;
          return (
            <div key={v.id} className={`voice-card ${on ? "on" : ""} ${v.basic ? "basic" : ""}`}>
              <button className="voice-pick" onClick={() => onChange(v.id)} aria-pressed={on}>
                <span className="voice-name">
                  {on && <Check size={14} strokeWidth={3} aria-hidden />} {v.name}
                </span>
                <span className="voice-meta">{v.basic ? v.accent : `${v.gender === "mujer" ? "Mujer" : "Hombre"} · ${v.accent}`}</span>
              </button>
              <button
                className="voice-play"
                onClick={() => listen(v)}
                disabled={!!loading && loading !== v.id}
                aria-label={playing === v.id ? "Detener" : `Escuchar a ${v.name}`}
                title={playing === v.id ? "Detener" : "Escuchar"}
              >
                {loading === v.id ? <Loader2 size={16} className="spin" /> : playing === v.id ? <Square size={14} /> : <Play size={16} />}
              </button>
            </div>
          );
        })}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
