"use client";

import { useMemo, useState } from "react";
import { Brand, brandContext } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { usePersistentState } from "@/lib/persist";
import type { Settings } from "@/lib/types";
import { locale } from "@/lib/i18n";

// Calendario de contenido con IA: un plan de publicaciones para 30 días.
// Cada día trae el tipo (post, reel o historia), el tema, una frase para la imagen,
// el texto listo para publicar y la descripción de la foto.

type Kind = "post" | "reel" | "historia";
type Entry = { date: string; type: Kind; pillar: string; title: string; caption: string; imagePrompt: string; done?: boolean };
type Freq = "7" | "5" | "3";

const FREQS: { id: Freq; label: string; days: number[] }[] = [
  { id: "3", label: "3 por semana (lun, mié, vie)", days: [1, 3, 5] },
  { id: "5", label: "5 por semana (lun a vie)", days: [1, 2, 3, 4, 5] },
  { id: "7", label: "Todos los días", days: [0, 1, 2, 3, 4, 5, 6] },
];
const KIND_LABEL: Record<Kind, string> = { post: "Post", reel: "Reel", historia: "Historia" };
const BATCH = 10;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const longDate = (s: string) =>
  new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" }).format(fromIso(s));
const shortDate = (s: string) => new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short" }).format(fromIso(s));

function planDates(start: string, freq: Freq, total = 30): string[] {
  const days = FREQS.find((f) => f.id === freq)!.days;
  const out: string[] = [];
  const d = fromIso(start);
  for (let i = 0; i < total; i++) {
    if (days.includes(d.getDay())) out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default function ContentCalendar({
  settings,
  brand,
  onImage,
  onEditor,
  onReel,
}: {
  settings: Settings;
  brand: Brand;
  onImage: (prompt: string) => void;
  onEditor: (text: string) => void;
  onReel: (topic: string) => void;
}) {
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return iso(d);
  }, []);
  const [goal, setGoal] = usePersistentState("calendario:objetivo", "");
  const [platform, setPlatform] = usePersistentState("calendario:red", "Instagram");
  const [freq, setFreq] = usePersistentState<Freq>("calendario:frecuencia", "5");
  const [start, setStart] = usePersistentState("calendario:inicio", tomorrow);
  const [plan, setPlan] = usePersistentState<Entry[]>("calendario:plan", []);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const headers: Record<string, string> =
    settings.textProvider === "cloudflare"
      ? { "content-type": "application/json", "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken }
      : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey };

  async function ask(dates: string[], previous: string): Promise<Omit<Entry, "date">[]> {
    const res = await fetch("/api/text", {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "calendar",
        prompt: goal,
        platform,
        dates: dates.map(longDate),
        previous,
        brand: brandContext(brand),
        provider: settings.textProvider,
        model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.items;
  }

  async function generate() {
    setError("");
    const dates = planDates(start || tomorrow, freq);
    const out: Entry[] = [];
    setPlan([]);
    try {
      for (let i = 0; i < dates.length; i += BATCH) {
        const chunk = dates.slice(i, i + BATCH);
        setBusy(`Planeando ${i + 1}–${i + chunk.length} de ${dates.length} publicaciones…`);
        const items = await ask(chunk, out.map((e) => e.title).join("; "));
        chunk.forEach((d, k) => out.push({ date: d, ...(items[k] || { type: "post", pillar: "", title: "", caption: "", imagePrompt: "" }) }));
        setPlan([...out]);
      }
      setOpen(out[0]?.date || null);
    } catch (e) {
      setError(friendlyError((e as Error).message) + (out.length ? ` Se guardaron las primeras ${out.length} publicaciones.` : ""));
    } finally {
      setBusy("");
    }
  }

  async function redo(date: string) {
    setError("");
    setBusy("Pensando otra idea…");
    try {
      const others = plan.filter((e) => e.date !== date).map((e) => e.title).join("; ");
      const [item] = await ask([date], others);
      if (item) setPlan((p) => p.map((e) => (e.date === date ? { ...e, ...item, done: false } : e)));
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setBusy("");
    }
  }

  const update = (date: string, patch: Partial<Entry>) => setPlan((p) => p.map((e) => (e.date === date ? { ...e, ...patch } : e)));

  function downloadCsv() {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ["Fecha", "Tipo", "Tema", "Frase para la imagen", "Texto para publicar", "Descripción de la foto", "Publicado"],
      ...plan.map((e) => [longDate(e.date), KIND_LABEL[e.type], e.pillar, e.title, e.caption, e.imagePrompt, e.done ? "Sí" : "No"]),
    ];
    const csv = "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "calendario-de-contenido.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Cuadrícula del mes (computadora): desde el lunes de la primera semana
  const grid = useMemo(() => {
    if (!plan.length) return [];
    const first = fromIso(plan[0].date);
    const last = fromIso(plan[plan.length - 1].date);
    const d = new Date(first);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const cells: string[] = [];
    while (d <= last || cells.length % 7) {
      cells.push(iso(d));
      d.setDate(d.getDate() + 1);
    }
    return cells;
  }, [plan]);
  const byDate = useMemo(() => new Map(plan.map((e) => [e.date, e])), [plan]);
  const doneCount = plan.filter((e) => e.done).length;
  const selected = open ? byDate.get(open) : undefined;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Calendario de contenido</h2>
        {plan.length > 0 && (
          <div className="actions">
            <button className="btn ghost small" onClick={downloadCsv}>
              Descargar (Excel)
            </button>
            <button className="btn ghost small" disabled={!!busy} onClick={() => confirm("¿Borrar el calendario actual?") && (setPlan([]), setOpen(null))}>
              Empezar nuevo
            </button>
          </div>
        )}
      </div>
      <p className="hint">Cuéntale a la IA de tu negocio y tu objetivo: te arma un mes de publicaciones con el texto y la idea de imagen de cada día.</p>

      {plan.length === 0 && (
        <>
          <label>¿Qué quieres lograr este mes?</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Ej.: Más clientes entre semana en mi taquería de San Antonio. Tenemos 2x1 los martes y el 16 de septiembre hacemos fiesta."
          />
          <div className="row">
            <div>
              <label>Red social principal</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {["Instagram", "Facebook", "TikTok", "LinkedIn", "Varias redes"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label>¿Cada cuánto publicas?</label>
              <select value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
                {FREQS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Empieza el</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
          </div>
          <button className="btn" disabled={!!busy || !goal.trim()} onClick={generate}>
            {busy ? "Planeando…" : `Crear mi calendario (${planDates(start || tomorrow, freq).length} publicaciones)`}
          </button>
        </>
      )}

      {busy && <div className="notice">{busy}</div>}
      {error && <div className="error">{error}</div>}

      {plan.length > 0 && (
        <>
          <div className="cal-progress">
            <span>
              {doneCount} de {plan.length} publicadas
            </span>
            <div className="bar">
              <div style={{ width: `${(doneCount / plan.length) * 100}%` }} />
            </div>
          </div>

          {/* Computadora: cuadrícula del mes */}
          <div className="cal-grid" role="grid" aria-label="Calendario">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <span key={d} className="cal-dow">
                {d}
              </span>
            ))}
            {grid.map((d) => {
              const e = byDate.get(d);
              const day = fromIso(d);
              return (
                <button
                  key={d}
                  className={`cal-cell ${e ? `has ${e.type}` : ""} ${open === d ? "open" : ""} ${e?.done ? "done" : ""}`}
                  disabled={!e}
                  onClick={() => setOpen(d)}
                >
                  <span className="cal-num">
                    {day.getDate() === 1 || d === grid[0] ? new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }).format(day) : day.getDate()}
                  </span>
                  {e && (
                    <>
                      <span className="cal-kind">{e.done ? "✓ " : ""}{KIND_LABEL[e.type]}</span>
                      <span className="cal-title">{e.title || e.pillar}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className="cal-detail-wrap">
              <EntryCard e={selected} expanded busy={!!busy} onUpdate={update} onRedo={redo} onImage={onImage} onEditor={onEditor} onReel={onReel} />
            </div>
          )}

          {/* Celular: lista */}
          <div className="cal-list">
            {plan.map((e) => (
              <EntryCard
                key={e.date}
                e={e}
                expanded={open === e.date}
                onToggle={() => setOpen(open === e.date ? null : e.date)}
                busy={!!busy}
                onUpdate={update}
                onRedo={redo}
                onImage={onImage}
                onEditor={onEditor}
                onReel={onReel}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EntryCard({
  e,
  expanded,
  onToggle,
  busy,
  onUpdate,
  onRedo,
  onImage,
  onEditor,
  onReel,
}: {
  e: Entry;
  expanded: boolean;
  onToggle?: () => void;
  busy: boolean;
  onUpdate: (date: string, patch: Partial<Entry>) => void;
  onRedo: (date: string) => void;
  onImage: (prompt: string) => void;
  onEditor: (text: string) => void;
  onReel: (topic: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <article className={`cal-entry ${e.type} ${e.done ? "done" : ""}`}>
      <button className="cal-entry-head" onClick={onToggle} aria-expanded={expanded} disabled={!onToggle}>
        <span className="cal-entry-date">{onToggle ? shortDate(e.date) : longDate(e.date)}</span>
        <span className={`cal-badge ${e.type}`}>{KIND_LABEL[e.type]}</span>
        {e.pillar && <span className="cal-pillar">{e.pillar}</span>}
        <strong className="cal-entry-title">{e.title}</strong>
      </button>
      {expanded && (
        <div className="cal-entry-body">
          <label>Frase para la imagen</label>
          <input value={e.title} onChange={(x) => onUpdate(e.date, { title: x.target.value })} />
          <label>Texto para publicar</label>
          <textarea value={e.caption} onChange={(x) => onUpdate(e.date, { caption: x.target.value })} />
          <div className="actions">
            <button
              className="btn ghost small"
              onClick={() => {
                navigator.clipboard.writeText(e.caption).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copiado" : "Copiar texto"}
            </button>
            {e.type === "reel" ? (
              <button className="btn small" onClick={() => onReel(`${e.title}. ${e.caption}`.replace(/#\S+/g, "").trim())}>
                Hacer el reel
              </button>
            ) : (
              <button className="btn small" onClick={() => onImage(e.imagePrompt || e.title)}>
                Crear la imagen
              </button>
            )}
            <button className="btn ghost small" onClick={() => onEditor(e.title)}>
              Diseñar en el editor
            </button>
            <button className="btn ghost small" disabled={busy} onClick={() => onRedo(e.date)}>
              Otra idea
            </button>
            <label className="check" style={{ margin: "8px 0 0 auto" }}>
              <input type="checkbox" checked={!!e.done} onChange={(x) => onUpdate(e.date, { done: x.target.checked })} />
              Ya lo publiqué
            </label>
          </div>
        </div>
      )}
    </article>
  );
}
