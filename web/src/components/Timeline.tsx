"use client";

import { useMemo } from "react";
import type { MatchData } from "@/lib/types";
import { fmtMs } from "@/lib/data";
import { EVENT_META } from "@/lib/colors";

interface Props {
  match: MatchData | null;
  playheadMs: number;
  setPlayheadMs: (v: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  playSpeed: number;
  setPlaySpeed: (v: number) => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function Timeline(p: Props) {
  const duration = p.match?.durationMs ?? 0;
  // Pre-bucket non-position events for tick marks on the rail.
  const ticks = useMemo(() => {
    if (!p.match) return [] as Array<{ t: number; code: string }>;
    return p.match.events.map(([t, , c]) => ({ t, code: c as string }));
  }, [p.match]);

  return (
    <div className="shrink-0 border-t border-ink-700 bg-ink-900 px-4 py-3">
      <div className="mb-2 flex items-center gap-3 text-xs">
        <button
          disabled={!p.match}
          onClick={() => {
            if (!p.match) return;
            if (p.playheadMs >= p.match.durationMs) p.setPlayheadMs(0);
            p.setPlaying(!p.playing);
          }}
          className="rounded bg-accent px-3 py-1 text-ink-950 font-semibold disabled:opacity-30"
        >
          {p.playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          disabled={!p.match}
          onClick={() => p.setPlayheadMs(0)}
          className="rounded bg-ink-700 px-2 py-1 text-zinc-300 disabled:opacity-30 hover:bg-ink-600"
        >
          ⟲ Restart
        </button>
        <div className="flex items-center gap-1 rounded bg-ink-800 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => p.setPlaySpeed(s)}
              className={
                "rounded px-2 py-0.5 text-[11px] " +
                (p.playSpeed === s ? "bg-accent text-ink-950" : "text-zinc-400 hover:text-zinc-200")
              }
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="ml-auto text-zinc-500 font-mono">
          {fmtMs(p.playheadMs)} <span className="text-zinc-700">/</span> {fmtMs(duration)}
        </div>
      </div>

      <div className="relative h-8">
        {/* Tick marks for each discrete event */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-ink-800" />
        {duration > 0 &&
          ticks.map(({ t, code }, i) => {
            const meta = EVENT_META[code as keyof typeof EVENT_META];
            const left = `${(t / duration) * 100}%`;
            return (
              <div
                key={i}
                title={`${meta?.label ?? code} · ${fmtMs(t)}`}
                className="absolute top-1/2 -translate-y-1/2 h-3 w-[2px]"
                style={{ left, background: meta?.color ?? "#fff" }}
              />
            );
          })}
        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={Math.max(1, Math.round(duration / 1000))}
          value={p.playheadMs}
          onChange={(e) => {
            p.setPlayheadMs(Number(e.target.value));
            p.setPlaying(false);
          }}
          disabled={!p.match}
          className="absolute inset-0 w-full"
        />
      </div>
    </div>
  );
}
