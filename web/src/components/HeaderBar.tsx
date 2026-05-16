"use client";

import type { Manifest } from "@/lib/types";

interface Props {
  manifest: Manifest;
  onShareCopy: () => void;
  onSnapshot: () => void;
  onHelp: () => void;
}

export function HeaderBar({ manifest, onShareCopy, onSnapshot, onHelp }: Props) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-900 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-accent text-ink-950 font-bold">
          L
        </div>
        <div>
          <div className="text-base font-semibold text-zinc-100">
            LILA BLACK · Player Journey Explorer
          </div>
          <div className="text-xs text-zinc-500">
            Telemetry visualiser for Level Design ·{" "}
            <span className="text-zinc-400">
              {manifest.totals.matches.toLocaleString()} matches ·{" "}
              {manifest.totals.humans} humans · {manifest.totals.bots} bots ·{" "}
              {manifest.totals.events.toLocaleString()} discrete events
            </span>
          </div>
        </div>
      </div>
      <div className="hidden items-center gap-2 text-xs text-zinc-500 md:flex">
        <span className="hidden xl:inline">
          Data window: <span className="text-zinc-300">{manifest.dates[0]} → {manifest.dates[manifest.dates.length - 1]}</span>
        </span>
        <button
          onClick={onShareCopy}
          title="Copy a sharable link to this exact view"
          className="rounded bg-ink-700 px-2.5 py-1.5 text-zinc-300 hover:bg-ink-600"
        >
          🔗 Share
        </button>
        <button
          onClick={onSnapshot}
          title="Save the map view as a PNG (S)"
          className="rounded bg-ink-700 px-2.5 py-1.5 text-zinc-300 hover:bg-ink-600"
        >
          📸 PNG
        </button>
        <button
          onClick={onHelp}
          title="Show keyboard shortcuts (?)"
          className="rounded bg-ink-700 px-2.5 py-1.5 text-zinc-300 hover:bg-ink-600"
        >
          ? Help
        </button>
      </div>
    </header>
  );
}
