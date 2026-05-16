import type { Manifest, MatchData } from "./types";

const MATCH_CACHE = new Map<string, MatchData>();

export async function loadManifest(): Promise<Manifest> {
  const r = await fetch("/data/manifest.json", { cache: "force-cache" });
  if (!r.ok) throw new Error(`Failed to load manifest: ${r.status}`);
  return r.json();
}

export async function loadMatch(matchId: string): Promise<MatchData> {
  const hit = MATCH_CACHE.get(matchId);
  if (hit) return hit;
  const r = await fetch(`/data/matches/${encodeURIComponent(matchId)}.json`, {
    cache: "force-cache",
  });
  if (!r.ok) throw new Error(`Failed to load match ${matchId}: ${r.status}`);
  const doc = (await r.json()) as MatchData;
  MATCH_CACHE.set(matchId, doc);
  return doc;
}

export function fmtMs(ms: number): string {
  if (!isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m ${r.toFixed(1)}s`;
}
