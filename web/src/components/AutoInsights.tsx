"use client";

import { useMemo } from "react";
import type { MatchAutoInsights, MatchData } from "@/lib/types";
import { fmtMs } from "@/lib/data";

interface Props {
  match: MatchData | null;
}

export function AutoInsights({ match }: Props) {
  const lines = useMemo(() => buildLines(match), [match]);
  if (!match || !match.autoInsights) return null;
  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-accent">
          Auto-insights
        </div>
        <div className="text-[9px] text-zinc-500">computed from match</div>
      </div>
      <ul className="space-y-1 text-[11px] text-zinc-300">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-accent">▸</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildLines(match: MatchData | null): string[] {
  if (!match || !match.autoInsights) return [];
  const a: MatchAutoInsights = match.autoInsights;
  const lines: string[] = [];

  if (a.firstLootMs != null) lines.push(`First loot at ${fmtMs(a.firstLootMs)}.`);
  if (a.firstCombatMs != null) lines.push(`First combat at ${fmtMs(a.firstCombatMs)}.`);
  else if (a.firstLootMs != null) lines.push(`No combat events — pure looting run.`);

  if (a.firstStormMs != null) lines.push(`Storm caught a player at ${fmtMs(a.firstStormMs)} (failed extraction).`);

  if (a.totalHumanDistance > 0) {
    lines.push(`Humans moved ${a.totalHumanDistance.toFixed(0)} world units total.`);
  }

  if (a.tightness != null) {
    const t = a.tightness;
    if (t > 0.85) lines.push(`Linear path (tightness ${t.toFixed(2)}) — straight push, low backtracking.`);
    else if (t < 0.35) lines.push(`Tight wandering (tightness ${t.toFixed(2)}) — circling a small area.`);
    else lines.push(`Mixed motion (tightness ${t.toFixed(2)}) — some exploration with backtracking.`);
  }

  // Loot velocity
  const loot = Object.values(match.participants).reduce((s, p) => s + p.loots, 0);
  if (loot > 0 && match.durationMs > 0) {
    const rate = loot / (match.durationMs / 1000);
    if (rate > 80) lines.push(`Loot velocity: ${rate.toFixed(0)} pickups/sec — heavy auto-loot session.`);
    else if (rate > 10) lines.push(`Loot velocity: ${rate.toFixed(0)} pickups/sec — active looting.`);
  }

  // Kill ratio
  let kills = 0;
  let deaths = 0;
  for (const p of Object.values(match.participants)) {
    kills += p.kills + p.botKills;
    deaths += p.killedByHuman + p.killedByBot + p.killedByStorm;
  }
  if (kills > 0 || deaths > 0) {
    lines.push(`Combat outcome: ${kills} kill${kills === 1 ? "" : "s"}, ${deaths} death${deaths === 1 ? "" : "s"}.`);
  }

  return lines;
}
