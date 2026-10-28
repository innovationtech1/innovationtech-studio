"use client";

import { useState } from "react";
import { VolumeX } from "lucide-react";
import { MUSIC_GROUPS, MUSIC_STYLES, MusicGroup, MusicStyleId } from "@/lib/music";

// Estilos de música gratis, agrupados por ánimo. Se usa en el creador de reels y en el editor de video.
export default function MusicPicker({
  value,
  on = true,
  onPick,
  onNone,
}: {
  value: MusicStyleId;
  on?: boolean;
  onPick: (id: MusicStyleId) => void;
  onNone?: () => void;
}) {
  const [group, setGroup] = useState<MusicGroup | "todas">("todas");
  const list = MUSIC_STYLES.filter((m) => group === "todas" || m.group === group);
  return (
    <>
      <div className="seg music-groups">
        <button className={group === "todas" ? "active" : ""} onClick={() => setGroup("todas")}>
          {`Todas (${MUSIC_STYLES.length})`}
        </button>
        {MUSIC_GROUPS.map((g) => (
          <button key={g.id} className={group === g.id ? "active" : ""} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="music-grid">
        {onNone && (
          <button className={!on ? "active" : ""} onClick={onNone}>
            <VolumeX size={18} aria-hidden />
            <strong>Sin música</strong>
          </button>
        )}
        {list.map((m) => (
          <button key={m.id} className={on && value === m.id ? "active" : ""} onClick={() => onPick(m.id)} title={m.desc}>
            <span className="emoji">{m.emoji}</span>
            <strong>{m.label}</strong>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>
    </>
  );
}
