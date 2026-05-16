"use client";

import { useMemo, useState } from "react";
import type { HeatmapMode, Manifest, ManifestMatch } from "@/lib/types";
import { fmtMs } from "@/lib/data";

interface Props {
  manifest: Manifest;
  mapId: string;
  setMapId: (m: string) => void;
  date: string;
  setDate: (d: string) => void;
  matches: ManifestMatch[];
  matchId: string | null;
  setMatchId: (m: string) => void;
  showHumans: boolean;
  setShowHumans: (v: boolean) => void;
  showBots: boolean;
  setShowBots: (v: boolean) => void;
  showTrails: boolean;
  setShowTrails: (v: boolean) => void;
  showEvents: boolean;
  setShowEvents: (v: boolean) => void;
  heatmapMode: HeatmapMode;
  setHeatmapMode: (m: HeatmapMode) => void;
  heatmapScope: "match" | "global";
  setHeatmapScope: (s: "match" | "global") => void;
}

type SortKey = "events" | "kills" | "stormDeaths" | "duration" | "players";

export function ControlPanel(p: Props) {
  const [sort, setSort] = useState<SortKey>("events");
  const [search, setSearch] = useState("");

  const sortedMatches = useMemo(() => {
    const ms = [...p.matches];
    ms.sort((a, b) => {
      switch (sort) {
        case "kills":
          return (b.kills + b.botKills) - (a.kills + a.botKills);
        case "stormDeaths":
          return b.stormDeaths - a.stormDeaths;
        case "duration":
          return b.durationMs - a.durationMs;
        case "players":
          return (b.humanCount + b.botCount) - (a.humanCount + a.botCount);
        default:
          return b.eventCount - a.eventCount;
      }
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      return ms.filter((m) => m.matchId.toLowerCase().includes(q));
    }
    return ms;
  }, [p.matches, sort, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 border-b border-ink-700 p-4">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
            Map
          </label>
          <div className="grid grid-cols-3 gap-1">
            {p.manifest.maps.map((m) => (
              <button
                key={m}
                onClick={() => p.setMapId(m)}
                className={
                  "rounded px-2 py-2 text-xs font-medium transition " +
                  (m === p.mapId
                    ? "bg-accent text-ink-950"
                    : "bg-ink-700 text-zinc-300 hover:bg-ink-600")
                }
              >
                {p.manifest.mapConfig[m]?.label ?? m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
            Date
          </label>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => p.setDate("all")}
              className={
                "rounded px-2 py-1 text-xs font-medium transition " +
                (p.date === "all"
                  ? "bg-accent text-ink-950"
                  : "bg-ink-700 text-zinc-300 hover:bg-ink-600")
              }
            >
              All
            </button>
            {p.manifest.dates.map((d) => {
              const short = d.slice(5).replace("-", "/");
              return (
                <button
                  key={d}
                  onClick={() => p.setDate(d)}
                  className={
                    "rounded px-2 py-1 text-xs font-medium transition " +
                    (p.date === d
                      ? "bg-accent text-ink-950"
                      : "bg-ink-700 text-zinc-300 hover:bg-ink-600")
                  }
                >
                  {short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <Toggle label="Trails" value={p.showTrails} on={p.setShowTrails} />
          <Toggle label="Events" value={p.showEvents} on={p.setShowEvents} />
          <Toggle label="Humans" value={p.showHumans} on={p.setShowHumans} />
          <Toggle label="Bots" value={p.showBots} on={p.setShowBots} />
        </div>

        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
            Heatmap
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                ["off", "Off"],
                ["traffic", "Traffic"],
                ["kills", "Kills"],
                ["deaths", "Deaths"],
                ["loot", "Loot"],
                ["storm", "Storm"],
              ] as Array<[HeatmapMode, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => p.setHeatmapMode(k)}
                className={
                  "rounded px-2 py-1.5 text-[11px] font-medium transition " +
                  (p.heatmapMode === k
                    ? "bg-accent text-ink-950"
                    : "bg-ink-700 text-zinc-300 hover:bg-ink-600")
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
            Scope:
            <button
              onClick={() => p.setHeatmapScope("match")}
              className={
                "rounded px-2 py-0.5 transition " +
                (p.heatmapScope === "match"
                  ? "bg-ink-600 text-zinc-100"
                  : "bg-ink-800 text-zinc-500 hover:text-zinc-300")
              }
            >
              this match
            </button>
            <button
              onClick={() => p.setHeatmapScope("global")}
              className={
                "rounded px-2 py-0.5 transition " +
                (p.heatmapScope === "global"
                  ? "bg-ink-600 text-zinc-100"
                  : "bg-ink-800 text-zinc-500 hover:text-zinc-300")
              }
            >
              all filtered
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-ink-700 p-4 pb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Matches</div>
          <div className="text-xs text-zinc-300">
            {sortedMatches.length} on {p.manifest.mapConfig[p.mapId]?.label ?? p.mapId}
          </div>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded bg-ink-700 px-2 py-1 text-xs text-zinc-200 border border-ink-600 focus:border-accent focus:outline-none"
        >
          <option value="events">Most events</option>
          <option value="kills">Most kills</option>
          <option value="stormDeaths">Most storm deaths</option>
          <option value="duration">Longest</option>
          <option value="players">Most players</option>
        </select>
      </div>
      <div className="px-4 pt-2">
        <input
          type="text"
          placeholder="Search match id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded bg-ink-800 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 border border-ink-700 focus:border-accent focus:outline-none font-mono"
        />
      </div>

      <ul className="flex-1 overflow-auto px-2 py-2 space-y-1">
        {sortedMatches.map((m) => {
          const sel = m.matchId === p.matchId;
          return (
            <li key={m.matchId}>
              <button
                onClick={() => p.setMatchId(m.matchId)}
                className={
                  "w-full rounded-md px-2.5 py-2 text-left transition " +
                  (sel
                    ? "bg-ink-700 ring-1 ring-accent/60"
                    : "hover:bg-ink-800")
                }
              >
                <div className="font-mono text-[11px] text-zinc-300 truncate">
                  {m.matchId.replace(".nakama-0", "")}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                  <span>{m.date.slice(5)}</span>
                  <span>·</span>
                  <span>{fmtMs(m.durationMs)}</span>
                  <span>·</span>
                  <span>{m.humanCount}H / {m.botCount}B</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  {m.kills > 0 && <Badge color="bg-event-kill/20 text-red-300">{m.kills} kill</Badge>}
                  {m.botKills > 0 && <Badge color="bg-event-botKill/20 text-orange-300">{m.botKills} botkill</Badge>}
                  {m.stormDeaths > 0 && <Badge color="bg-event-storm/20 text-pink-300">{m.stormDeaths} storm</Badge>}
                  {m.loots > 0 && <Badge color="bg-event-loot/20 text-cyan-300">{m.loots} loot</Badge>}
                </div>
              </button>
            </li>
          );
        })}
        {sortedMatches.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-zinc-500">
            No matches on this map / date.
          </li>
        )}
      </ul>
    </div>
  );
}

function Toggle({ label, value, on }: { label: string; value: boolean; on: (v: boolean) => void }) {
  return (
    <button
      onClick={() => on(!value)}
      className={
        "flex items-center justify-between rounded border px-2 py-1.5 transition " +
        (value
          ? "border-accent/60 bg-accent/10 text-zinc-100"
          : "border-ink-700 bg-ink-800 text-zinc-500 hover:text-zinc-300")
      }
    >
      <span>{label}</span>
      <span
        className={
          "ml-2 inline-block h-2 w-2 rounded-full " +
          (value ? "bg-accent" : "bg-ink-500")
        }
      />
    </button>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={"rounded px-1.5 py-0.5 font-medium " + color}>{children}</span>
  );
}
