"use client";

import { useMemo } from "react";
import type { MatchData } from "@/lib/types";
import { fmtMs } from "@/lib/data";
import { EVENT_META, colorForUser } from "@/lib/colors";

export function StatsPanel({
  match,
  extraTop,
}: {
  match: MatchData | null;
  extraTop?: React.ReactNode;
}) {
  const counts = useMemo(() => {
    if (!match) return null;
    let humans = 0,
      bots = 0,
      kills = 0,
      botKills = 0,
      humanDeaths = 0,
      botDeaths = 0,
      stormDeaths = 0,
      loots = 0;
    for (const p of Object.values(match.participants)) {
      if (p.isBot) bots++;
      else humans++;
      kills += p.kills;
      botKills += p.botKills;
      humanDeaths += p.killedByHuman;
      botDeaths += p.killedByBot;
      stormDeaths += p.killedByStorm;
      loots += p.loots;
    }
    return { humans, bots, kills, botKills, humanDeaths, botDeaths, stormDeaths, loots };
  }, [match]);

  if (!match) {
    return (
      <div className="p-4 text-xs text-zinc-500">
        Select a match to see participants and a per-player breakdown.
      </div>
    );
  }
  return (
    <div className="overflow-auto p-4">
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Match</div>
        <div className="break-all font-mono text-[11px] text-zinc-300">
          {match.matchId.replace(".nakama-0", "")}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {match.date} · {match.mapId} · {fmtMs(match.durationMs)}
        </div>
      </div>

      {extraTop ? <div className="mb-3">{extraTop}</div> : null}

      {counts && (
        <div className="mb-4 grid grid-cols-2 gap-1.5 text-[11px]">
          <Tile label="Humans" value={counts.humans} color="text-amber-300" />
          <Tile label="Bots" value={counts.bots} color="text-sky-300" />
          <Tile label="Kills (H→H)" value={counts.kills} color="text-red-300" />
          <Tile label="Bot kills (H→B)" value={counts.botKills} color="text-orange-300" />
          <Tile label="Killed by bot" value={counts.botDeaths} color="text-purple-300" />
          <Tile label="Storm deaths" value={counts.stormDeaths} color="text-pink-300" />
          <Tile label="Loot pickups" value={counts.loots} color="text-cyan-300" />
          <Tile label="Events" value={match.events.length} color="text-zinc-300" />
        </div>
      )}

      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Participants</div>
      <ul className="space-y-1">
        {Object.values(match.participants)
          .sort((a, b) => (b.kills + b.botKills) - (a.kills + a.botKills))
          .map((p) => (
            <li key={p.userId} className="flex items-center gap-2 rounded bg-ink-800 px-2 py-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: colorForUser(p.userId, p.isBot) }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[10px] text-zinc-300">
                  {p.isBot ? `bot ${p.userId}` : p.userId.slice(0, 14)}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {p.kills > 0 && <span className="mr-2 text-red-300">{p.kills}K</span>}
                  {p.botKills > 0 && <span className="mr-2 text-orange-300">{p.botKills}BK</span>}
                  {p.loots > 0 && <span className="mr-2 text-cyan-300">{p.loots}L</span>}
                  {p.killedByBot > 0 && <span className="mr-2 text-purple-300">dead-by-bot</span>}
                  {p.killedByStorm > 0 && <span className="mr-2 text-pink-300">storm</span>}
                </div>
              </div>
            </li>
          ))}
      </ul>

      <div className="mt-4">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Event log</div>
        <ul className="max-h-44 space-y-1 overflow-auto pr-1 text-[10px]">
          {match.events.length === 0 && <li className="text-zinc-600">No combat / loot events.</li>}
          {match.events.map(([t, uid, code], i) => {
            const meta = EVENT_META[code as keyof typeof EVENT_META];
            return (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono text-zinc-600">{t.toString().padStart(4, " ")}ms</span>
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: meta?.color ?? "#fff" }}
                />
                <span className="text-zinc-400">{meta?.label ?? code}</span>
                <span className="ml-auto truncate font-mono text-zinc-600">
                  {uid.length > 10 ? uid.slice(0, 8) + "…" : uid}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded bg-ink-800 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={"text-base font-semibold " + color}>{value}</div>
    </div>
  );
}
