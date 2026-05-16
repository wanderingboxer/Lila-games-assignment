"use client";

import type { Manifest } from "@/lib/types";

export function HeaderBar({ manifest }: { manifest: Manifest }) {
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
      <div className="hidden text-xs text-zinc-500 md:flex md:items-center md:gap-3">
        <span>
          Data window: <span className="text-zinc-300">{manifest.dates[0]} → {manifest.dates[manifest.dates.length - 1]}</span>
        </span>
        <span className="rounded bg-ink-700 px-2 py-1 font-mono text-[10px] text-zinc-300">
          built {manifest.generatedAt.split("T")[0]}
        </span>
      </div>
    </header>
  );
}
