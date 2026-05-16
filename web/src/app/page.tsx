"use client";

import { useEffect, useMemo, useState } from "react";
import { loadManifest, loadMatch } from "@/lib/data";
import type { HeatmapMode, Manifest, ManifestMatch, MatchData } from "@/lib/types";
import { ControlPanel } from "@/components/ControlPanel";
import { MapViewport } from "@/components/MapViewport";
import { Timeline } from "@/components/Timeline";
import { StatsPanel } from "@/components/StatsPanel";
import { Legend } from "@/components/Legend";
import { HeaderBar } from "@/components/HeaderBar";
import { GlobalStats } from "@/components/GlobalStats";

export default function HomePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mapId, setMapId] = useState<string>("AmbroseValley");
  const [date, setDate] = useState<string>("all");
  const [matchId, setMatchId] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);

  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("off");
  const [heatmapScope, setHeatmapScope] = useState<"match" | "global">("global");

  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);

  // Load manifest once.
  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((e) => setError(String(e)));
  }, []);

  // Filter the manifest's match list by map + date.
  const filteredMatches: ManifestMatch[] = useMemo(() => {
    if (!manifest) return [];
    return manifest.matches.filter(
      (m) => m.mapId === mapId && (date === "all" || m.date === date),
    );
  }, [manifest, mapId, date]);

  // Reset matchId when filters change.
  useEffect(() => {
    if (filteredMatches.length === 0) {
      setMatchId(null);
      return;
    }
    if (!matchId || !filteredMatches.find((m) => m.matchId === matchId)) {
      // Default: longest match with the most events.
      const sorted = [...filteredMatches].sort(
        (a, b) => b.eventCount - a.eventCount || b.durationMs - a.durationMs,
      );
      setMatchId(sorted[0].matchId);
    }
  }, [filteredMatches, matchId]);

  // Load the selected match.
  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      return;
    }
    let cancelled = false;
    setLoadingMatch(true);
    loadMatch(matchId)
      .then((m) => {
        if (cancelled) return;
        setMatch(m);
        setPlayheadMs(m.durationMs); // start fully played-through
        setPlaying(false);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoadingMatch(false));
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // Playback loop.
  useEffect(() => {
    if (!playing || !match) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setPlayheadMs((p) => {
        const next = p + dt * playSpeed;
        if (next >= match.durationMs) {
          setPlaying(false);
          return match.durationMs;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, playSpeed, match]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-red-900 bg-red-950/40 p-6 text-red-200">
          <h1 className="mb-2 text-lg font-semibold">Failed to load data</h1>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading telemetry…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <HeaderBar manifest={manifest} />
      <div className="flex flex-1 min-h-0">
        <aside className="hidden w-[320px] shrink-0 border-r border-ink-700 bg-ink-900 md:flex md:flex-col">
          <ControlPanel
            manifest={manifest}
            mapId={mapId}
            setMapId={setMapId}
            date={date}
            setDate={setDate}
            matches={filteredMatches}
            matchId={matchId}
            setMatchId={setMatchId}
            showHumans={showHumans}
            setShowHumans={setShowHumans}
            showBots={showBots}
            setShowBots={setShowBots}
            showTrails={showTrails}
            setShowTrails={setShowTrails}
            showEvents={showEvents}
            setShowEvents={setShowEvents}
            heatmapMode={heatmapMode}
            setHeatmapMode={setHeatmapMode}
            heatmapScope={heatmapScope}
            setHeatmapScope={setHeatmapScope}
          />
        </aside>
        <section className="relative flex flex-1 flex-col min-h-0">
          <div className="relative flex flex-1 items-center justify-center bg-ink-950 p-4 min-h-0">
            <MapViewport
              manifest={manifest}
              mapId={mapId}
              match={match}
              loadingMatch={loadingMatch}
              showHumans={showHumans}
              showBots={showBots}
              showTrails={showTrails}
              showEvents={showEvents}
              heatmapMode={heatmapMode}
              heatmapScope={heatmapScope}
              playheadMs={playheadMs}
              filteredMatches={filteredMatches}
            />
          </div>
          <Timeline
            match={match}
            playheadMs={playheadMs}
            setPlayheadMs={setPlayheadMs}
            playing={playing}
            setPlaying={setPlaying}
            playSpeed={playSpeed}
            setPlaySpeed={setPlaySpeed}
          />
        </section>
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-ink-700 bg-ink-900 lg:flex">
          <StatsPanel match={match} />
          <div className="flex-1 overflow-auto border-t border-ink-700 p-4">
            <Legend />
          </div>
          <div className="border-t border-ink-700 p-4">
            <GlobalStats manifest={manifest} />
          </div>
        </aside>
      </div>
    </main>
  );
}
