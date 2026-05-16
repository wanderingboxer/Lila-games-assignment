"use client";

import { EVENT_META } from "@/lib/colors";

const ENTRIES = [
  { k: "K", help: "Diamond. A human killed another human." },
  { k: "BK", help: "Diamond. A human killed a bot." },
  { k: "KD", help: "X mark. A human died to another human." },
  { k: "BKD", help: "X mark. A human died to a bot." },
  { k: "S", help: "Bolt. A player died to the storm." },
  { k: "L", help: "Square. A loot pickup." },
] as const;

export function Legend() {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Legend</div>
      <ul className="space-y-1.5 text-[11px]">
        {ENTRIES.map(({ k, help }) => {
          const meta = EVENT_META[k];
          return (
            <li key={k} className="flex items-start gap-2">
              <span
                className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ background: meta.color }}
              />
              <div>
                <div className="text-zinc-300">{meta.label}</div>
                <div className="text-zinc-500">{help}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded bg-ink-800 p-2 text-[10px] text-zinc-500">
        Trails are colored per player. Humans use warm hues (amber/orange); bots use cool hues (sky/cyan).
        Trail head is the player&apos;s position at the current playback time.
      </div>
    </div>
  );
}
