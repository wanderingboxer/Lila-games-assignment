"use client";

import { useMemo } from "react";
import type { Manifest } from "@/lib/types";

export function GlobalStats({ manifest }: { manifest: Manifest }) {
  const rolled = useMemo(() => {
    const byMap: Record<string, { matches: number; kills: number; botKills: number; storm: number; loot: number }> = {};
    for (const m of manifest.matches) {
      const slot = (byMap[m.mapId] ??= { matches: 0, kills: 0, botKills: 0, storm: 0, loot: 0 });
      slot.matches++;
      slot.kills += m.kills;
      slot.botKills += m.botKills;
      slot.storm += m.stormDeaths;
      slot.loot += m.loots;
    }
    return byMap;
  }, [manifest]);

  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Global rollups</div>
      <ul className="space-y-1 text-[11px]">
        {Object.entries(rolled).map(([mp, r]) => (
          <li key={mp} className="flex items-center justify-between rounded bg-ink-800 px-2 py-1">
            <span className="text-zinc-300">{manifest.mapConfig[mp]?.label ?? mp}</span>
            <span className="text-zinc-500">
              {r.matches}m · {r.kills + r.botKills}k · {r.storm}s · {r.loot}l
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[9px] text-zinc-600">
        m = matches · k = kills (h+b) · s = storm deaths · l = loot
      </div>
    </div>
  );
}
