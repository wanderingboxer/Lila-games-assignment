"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadManifest, loadMatch } from "@/lib/data";
import type { HeatmapMode, Manifest, ManifestMatch, MatchData } from "@/lib/types";
import { readUrlState, useUrlSync } from "@/lib/url-state";
import { useKeyboard } from "@/lib/keyboard";
import { ControlPanel } from "@/components/ControlPanel";
import { MapViewport } from "@/components/MapViewport";
import { Timeline } from "@/components/Timeline";
import { StatsPanel } from "@/components/StatsPanel";
import { Legend } from "@/components/Legend";
import { HeaderBar } from "@/components/HeaderBar";
import { GlobalStats } from "@/components/GlobalStats";
import { HelpOverlay } from "@/components/HelpOverlay";
import { AutoInsights } from "@/components/AutoInsights";

const HEATMAP_CYCLE: HeatmapMode[] = ["off", "traffic", "cold", "kills", "deaths", "loot", "storm"];

export default function HomePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read URL state once on mount.
  const initial = useMemo(() => (typeof window === "undefined" ? {} : readUrlState()), []);

  const [mapId, setMapId] = useState<string>(initial.map ?? "AmbroseValley");
  const [date, setDate] = useState<string>(initial.date ?? "all");
  const [matchId, setMatchId] = useState<string | null>(initial.match ?? null);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);

  const [showHumans, setShowHumans] = useState(initial.humans ?? true);
  const [showBots, setShowBots] = useState(initial.bots ?? true);
  const [showTrails, setShowTrails] = useState(initial.trails ?? true);
  const [showEvents, setShowEvents] = useState(initial.events ?? true);
  const [showPOIs, setShowPOIs] = useState(initial.pois ?? true);
  const [showStorm, setShowStorm] = useState(initial.storm ?? false);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>((initial.hm as HeatmapMode) ?? "off");
  const [heatmapScope, setHeatmapScope] = useState<"match" | "global">(
    (initial.scope as "match" | "global") ?? "global",
  );

  const [playheadMs, setPlayheadMs] = useState(initial.t ?? 0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Only honor the initial.t (URL-provided playhead) on the *first* match load.
  // After that, switching matches should reset to the new match's end.
  const honoredInitialPlayheadRef = useRef(initial.t == null);

  // Keep URL in sync.
  useUrlSync({
    map: mapId,
    date,
    match: matchId,
    hm: heatmapMode,
    scope: heatmapScope,
    trails: showTrails,
    events: showEvents,
    humans: showHumans,
    bots: showBots,
    pois: showPOIs,
    storm: showStorm,
    t: playheadMs,
  });

  // Load manifest once.
  useEffect(() => {
    loadManifest()
      .then((m) => {
        // If the URL deep-linked a match but didn't specify the map (the
        // default AmbroseValley would otherwise discard the match on
        // Lockdown / GrandRift), infer the map from the match itself.
        if (initial.match && initial.map == null) {
          const hit = m.matches.find((r) => r.matchId === initial.match);
          if (hit && hit.mapId !== mapId) setMapId(hit.mapId);
        }
        setManifest(m);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Honor the URL's playhead only on the very first match load.
        if (honoredInitialPlayheadRef.current) {
          setPlayheadMs(m.durationMs);
        } else {
          honoredInitialPlayheadRef.current = true;
        }
        setPlaying(false);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoadingMatch(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2000);
  }, []);

  const snapshot = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Compose a slightly larger canvas with a caption strip.
    const captionH = 56;
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height + captionH;
    const octx = out.getContext("2d");
    if (!octx) return;
    octx.fillStyle = "#07090d";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(c, 0, captionH);
    // caption
    octx.fillStyle = "#facc15";
    octx.font = "700 22px Inter, system-ui";
    octx.textBaseline = "middle";
    octx.fillText(`LILA · ${manifest?.mapConfig[mapId]?.label ?? mapId}`, 18, 24);
    octx.fillStyle = "#9ca3af";
    octx.font = "500 14px Inter, system-ui";
    const right = match
      ? `match ${match.matchId.slice(0, 8)} · ${match.date} · heatmap: ${heatmapMode}`
      : `heatmap: ${heatmapMode}`;
    octx.fillText(right, 18, 44);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lila-${mapId}-${match?.matchId.slice(0, 8) ?? "view"}-${heatmapMode}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast("Snapshot saved");
    });
  }, [match, mapId, manifest, heatmapMode, showToast]);

  const cycleHeatmap = useCallback(() => {
    setHeatmapMode((m) => {
      const i = HEATMAP_CYCLE.indexOf(m);
      const next = HEATMAP_CYCLE[(i + 1) % HEATMAP_CYCLE.length];
      showToast(`Heatmap: ${next}`);
      return next;
    });
  }, [showToast]);

  const cycleMap = useCallback(() => {
    if (!manifest) return;
    const i = manifest.maps.indexOf(mapId);
    const next = manifest.maps[(i + 1) % manifest.maps.length];
    showToast(`Map: ${manifest.mapConfig[next]?.label ?? next}`);
    setMapId(next);
  }, [manifest, mapId, showToast]);

  const prevEvent = useCallback(() => {
    if (!match) return;
    const before = match.events.filter(([t]) => t < playheadMs - 1).map(([t]) => t);
    if (before.length === 0) return;
    setPlayheadMs(before[before.length - 1]);
    setPlaying(false);
  }, [match, playheadMs]);
  const nextEvent = useCallback(() => {
    if (!match) return;
    const after = match.events.find(([t]) => t > playheadMs + 1);
    if (!after) return;
    setPlayheadMs(after[0]);
    setPlaying(false);
  }, [match, playheadMs]);

  useKeyboard({
    togglePlay: () => {
      if (!match) return;
      if (playheadMs >= match.durationMs) setPlayheadMs(0);
      setPlaying((p) => !p);
    },
    step: (d) => {
      if (!match) return;
      setPlayheadMs((p) => Math.max(0, Math.min(match.durationMs, p + d)));
      setPlaying(false);
    },
    restart: () => {
      setPlayheadMs(0);
      setPlaying(false);
    },
    end: () => {
      if (!match) return;
      setPlayheadMs(match.durationMs);
      setPlaying(false);
    },
    prevEvent,
    nextEvent,
    cycleHeatmap,
    cycleMap,
    toggleHelp: () => setHelpOpen((h) => !h),
    togglePOIs: () => {
      setShowPOIs((v) => {
        showToast(`POI labels: ${!v ? "on" : "off"}`);
        return !v;
      });
    },
    toggleStorm: () => {
      setShowStorm((v) => {
        showToast(`Storm corridor: ${!v ? "on" : "off"}`);
        return !v;
      });
    },
    snapshot,
  });

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
      <HeaderBar
        manifest={manifest}
        onShareCopy={() => {
          navigator.clipboard?.writeText(window.location.href);
          showToast("Link copied · this is the shareable URL");
        }}
        onSnapshot={snapshot}
        onHelp={() => setHelpOpen(true)}
      />
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
            showPOIs={showPOIs}
            setShowPOIs={setShowPOIs}
            showStorm={showStorm}
            setShowStorm={setShowStorm}
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
              showPOIs={showPOIs}
              showStorm={showStorm}
              canvasRef={canvasRef}
            />
            {toast && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-ink-900/95 px-3 py-1.5 text-xs text-zinc-200 shadow-glow">
                {toast}
              </div>
            )}
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
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-ink-700 bg-ink-900 lg:flex overflow-hidden">
          <div className="flex-1 overflow-auto">
            <StatsPanel match={match} extraTop={<AutoInsights match={match} />} />
          </div>
          <div className="border-t border-ink-700 p-4">
            <Legend />
          </div>
          <div className="border-t border-ink-700 p-4">
            <GlobalStats manifest={manifest} />
          </div>
        </aside>
      </div>
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}
