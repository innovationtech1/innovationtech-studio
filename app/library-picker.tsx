"use client";

import { useState } from "react";
import { LIBRARY } from "@/lib/library";
import type { MusicGroup } from "@/lib/music";

const GROUPS: { id: MusicGroup | "todas"; label: string }[] = [
  { id: "todas", label: `Todas (${LIBRARY.length})` },
  { id: "animada", label: "Alegre" },
  { id: "latina", label: "Latina" },
  { id: "tranquila", label: "Tranquila" },
  { id: "intensa", label: "Intensa" },
];

// Canciones de la biblioteca (dominio público), agrupadas por ánimo. Se usa en el editor de video y en el creador de reels.
export default function LibraryPicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [group, setGroup] = useState<MusicGroup | "todas">("todas");
  return (
    <>
      <p className="hint">
        Canciones completas grabadas por músicos, de <strong>dominio público</strong> (FreePD.com): úsalas en anuncios, Instagram, TikTok,
        Facebook y YouTube sin pagar ni dar crédito. Toca una para escucharla; si el video es más largo, se repite.
      </p>
      <div className="seg music-groups">
        {GROUPS.map((g) => (
          <button key={g.id} className={group === g.id ? "active" : ""} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="music-grid">
        {LIBRARY.filter((x) => group === "todas" || x.group === group).map((x) => (
          <button key={x.id} className={value === x.id ? "active" : ""} onClick={() => onPick(x.id)} title={x.desc}>
            <span className="emoji">{x.emoji}</span>
            <strong data-no-translate>{x.title}</strong>
            <small>{x.desc}</small>
          </button>
        ))}
      </div>
    </>
  );
}
