"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { blobToBase64, toWav16k } from "@/lib/captions";
import { getLang } from "@/lib/i18n";
import { friendlyError } from "@/lib/errors";

// Dictado por voz: escribe lo que dices.
// 1) Si el navegador reconoce voz (Chrome, Edge, Safari), el texto aparece mientras hablas.
// 2) Si no (o si falla), graba y lo transcribe con Whisper de Cloudflare (gratis con tu cuenta).

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSR(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function MicButton({
  onText,
  onInterim,
  cfHeaders,
  disabled,
  size = "md",
}: {
  onText: (text: string) => void;
  onInterim?: (text: string) => void;
  cfHeaders: Record<string, string>;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const [state, setState] = useState<"idle" | "listening" | "recording" | "transcribing">("idle");
  const [error, setError] = useState("");
  const rec = useRef<SR | null>(null);
  const media = useRef<MediaRecorder | null>(null);
  const forceRecord = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const onInterimRef = useRef(onInterim);
  onInterimRef.current = onInterim;

  useEffect(
    () => () => {
      rec.current?.abort();
      media.current?.state === "recording" && media.current.stop();
    },
    []
  );

  const lang = () => (getLang() === "en" ? "en-US" : "es-MX");

  function startLive(SRClass: new () => SR) {
    const r = new SRClass();
    r.lang = lang();
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onTextRef.current(res[0].transcript.trim());
        else interim += res[0].transcript;
      }
      onInterimRef.current?.(interim);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") setError("Permite el uso del micrófono en tu navegador para dictar.");
      else if (e.error === "service-not-allowed" || e.error === "network" || e.error === "language-not-supported") {
        // Este navegador no deja reconocer voz aquí: usamos la grabación + Whisper
        forceRecord.current = true;
        setState("idle");
        startRecording();
        return;
      } else if (e.error !== "no-speech" && e.error !== "aborted") setError("No se pudo usar el dictado. Intenta de nuevo.");
    };
    r.onend = () => {
      onInterimRef.current?.("");
      setState((s) => (s === "listening" ? "idle" : s));
    };
    rec.current = r;
    r.start();
    setState("listening");
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("transcribing");
        try {
          const blob = new Blob(chunks, { type: mr.mimeType });
          const ctx = new AudioContext();
          const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
          ctx.close().catch(() => {});
          const wav = await toWav16k(buf, 0, Math.min(buf.duration, 85));
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "content-type": "application/json", ...cfHeaders },
            body: JSON.stringify({ audio: await blobToBase64(wav), language: getLang() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          const text = String(data.text || "").trim();
          if (text) onTextRef.current(text);
          else setError("No se escuchó nada. Acércate al micrófono e intenta de nuevo.");
        } catch (e) {
          setError(friendlyError((e as Error).message));
        } finally {
          setState("idle");
        }
      };
      media.current = mr;
      mr.start();
      setState("recording");
    } catch {
      setError("Permite el uso del micrófono en tu navegador para dictar.");
      setState("idle");
    }
  }

  const toggle = () => {
    setError("");
    if (state === "listening") return rec.current?.stop();
    if (state === "recording") return media.current?.stop();
    if (state === "transcribing") return;
    const SRClass = getSR();
    if (SRClass && !forceRecord.current) startLive(SRClass);
    else startRecording();
  };

  const active = state === "listening" || state === "recording";
  const label =
    state === "listening" ? "Escuchando… toca para terminar" : state === "recording" ? "Grabando… toca para terminar" : state === "transcribing" ? "Escribiendo lo que dijiste…" : "Dictar por voz";
  return (
    <span className="mic-wrap">
      <button
        type="button"
        className={`mic-btn ${size} ${active ? "on" : ""}`}
        onClick={toggle}
        disabled={disabled || state === "transcribing"}
        title={label}
        aria-label={label}
        aria-pressed={active}
      >
        {state === "transcribing" ? <Loader2 size={18} className="spin" aria-hidden /> : active ? <Square size={14} fill="currentColor" aria-hidden /> : <Mic size={18} aria-hidden />}
      </button>
      {active && <span className="mic-status">{state === "listening" ? "Escuchando…" : "Grabando…"}</span>}
      {error && <span className="mic-error">{error}</span>}
    </span>
  );
}
