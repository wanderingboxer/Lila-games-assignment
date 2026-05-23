"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HeatmapMode, Manifest, ManifestMatch, MatchData } from "@/lib/types";
import { worldToPixel } from "@/lib/coords";
import { EVENT_META, colorForUser } from "@/lib/colors";
import { renderHeatmap, RAMP_HEAT, RAMP_KILL, RAMP_LOOT, RAMP_STORM } from "@/lib/heatmap";
import { loadMatch } from "@/lib/data";

interface Props {
  manifest: Manifest;
  mapId: string;
  match: MatchData | null;
  loadingMatch: boolean;
  showHumans: boolean;
  showBots: boolean;
  showTrails: boolean;
  showEvents: boolean;
  heatmapMode: HeatmapMode;
  heatmapScope: "match" | "global";
  playheadMs: number;
  filteredMatches: ManifestMatch[];
  showPOIs: boolean;
  showStorm: boolean;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}

const RENDER_SIZE = 1024;

export function MapViewport(p: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = p.canvasRef ?? internalCanvasRef;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<{ x: number; z: number; pxOnScreen: { left: number; top: number } } | null>(
    null,
  );
  const [imgReady, setImgReady] = useState(false);

  const mapCfg = p.manifest.mapConfig[p.mapId];

  // ---- Heatmap source data ----
  // For "global" scope, prefetch matches we haven't seen for the current filter
  // and aggregate their event positions. This is intentionally lazy.
  const [globalAggregate, setGlobalAggregate] = useState<{
    key: string;
    points: Record<HeatmapMode, Array<[number, number]>>;
  } | null>(null);

  useEffect(() => {
    // Cold mode uses the static mapAnalysis.trafficGrid — no per-match aggregation needed.
    if (p.heatmapMode === "off" || p.heatmapMode === "cold" || p.heatmapScope !== "global") return;
    let cancelled = false;
    const key = `${p.mapId}|${p.filteredMatches.map((m) => m.matchId).join(",")}|${p.heatmapMode}`;
    if (globalAggregate?.key === key) return;

    (async () => {
      // Limit how many matches we load synchronously for the global heatmap;
      // the filtered list rarely exceeds a few hundred but each JSON is small.
      const maxMatches = 400;
      const slice = p.filteredMatches.slice(0, maxMatches);
      const acc: Record<HeatmapMode, Array<[number, number]>> = {
        off: [],
        traffic: [],
        cold: [],
        kills: [],
        deaths: [],
        loot: [],
        storm: [],
      };
      const promises = slice.map((m) => loadMatch(m.matchId).catch(() => null));
      const docs = await Promise.all(promises);
      if (cancelled) return;
      for (const md of docs) {
        if (!md) continue;
        for (const trail of Object.values(md.trails)) {
          for (const [, x, z] of trail) acc.traffic.push([x, z]);
        }
        for (const [, , code, x, z] of md.events) {
          if (code === "K" || code === "BK") acc.kills.push([x, z]);
          else if (code === "KD" || code === "BKD" || code === "S") acc.deaths.push([x, z]);
          else if (code === "L") acc.loot.push([x, z]);
          if (code === "S") acc.storm.push([x, z]);
        }
      }
      setGlobalAggregate({ key, points: acc });
    })();
    return () => {
      cancelled = true;
    };
  }, [p.filteredMatches, p.heatmapMode, p.heatmapScope, p.mapId]);

  // Map image preload
  useEffect(() => {
    if (!mapCfg) return;
    setImgReady(false);
    const img = new Image();
    img.src = mapCfg.image;
    img.onload = () => {
      imgRef.current = img;
      setImgReady(true);
    };
    img.onerror = () => setImgReady(false);
  }, [mapCfg]);

  // ---- Main render ----
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !mapCfg) {
      // DEBUG: log so we can see why the render didn't run.
      // eslint-disable-next-line no-console
      console.log("[lila/debug] render skipped:", { canvas: !!c, mapCfg: !!mapCfg });
      return;
    }
    const ctx = c.getContext("2d");
    if (!ctx) {
      // eslint-disable-next-line no-console
      console.log("[lila/debug] render skipped: no 2d ctx");
      return;
    }
    // eslint-disable-next-line no-console
    console.log("[lila/debug] render running:", {
      canvasInternal: { w: c.width, h: c.height },
      canvasCss: { w: c.offsetWidth, h: c.offsetHeight },
      mapCfg: { id: p.mapId, scale: mapCfg.scale, image: mapCfg.image },
      imgReady,
      hasImg: !!imgRef.current,
    });
    ctx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);

    // DEBUG: always paint a visible test pattern BEFORE the real render
    // so we know the canvas itself is alive and sized. Remove once we're done.
    ctx.fillStyle = "rgba(255, 0, 80, 0.4)";
    ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CANVAS OK", RENDER_SIZE / 2, RENDER_SIZE / 2);
    ctx.font = "24px sans-serif";
    ctx.fillText(
      `${c.offsetWidth}×${c.offsetHeight} (display) · img:${imgReady ? "yes" : "no"}`,
      RENDER_SIZE / 2,
      RENDER_SIZE / 2 + 50,
    );

    if (imgRef.current && imgReady) {
      ctx.drawImage(imgRef.current, 0, 0, RENDER_SIZE, RENDER_SIZE);
    } else {
      // Fallback dark backdrop with grid.
      ctx.fillStyle = "#0c0f15";
      ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);
      ctx.strokeStyle = "#181d27";
      ctx.lineWidth = 1;
      for (let i = 0; i <= RENDER_SIZE; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, RENDER_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(RENDER_SIZE, i);
        ctx.stroke();
      }
    }

    // Dim the map a touch so overlays pop.
    ctx.fillStyle = "rgba(7,9,13,0.30)";
    ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);

    // --- Cold-zones overlay ---
    // Mask the map with a translucent fill, then "cut holes" at cells with traffic.
    // What remains painted = areas of the map nobody visited.
    if (p.heatmapMode === "cold") {
      const analysis = p.manifest.mapAnalysis?.[p.mapId];
      if (analysis && analysis.playableBbox) {
        const cellSize = analysis.trafficCell;
        ctx.save();
        // Paint a violet tint over the entire playable bbox.
        const bbox = analysis.playableBbox;
        const tl = worldToPixel(bbox.minX, bbox.maxZ, mapCfg, RENDER_SIZE);
        const br = worldToPixel(bbox.maxX, bbox.minZ, mapCfg, RENDER_SIZE);
        ctx.fillStyle = "rgba(99, 102, 241, 0.36)";
        ctx.fillRect(
          Math.min(tl.px, br.px),
          Math.min(tl.py, br.py),
          Math.abs(br.px - tl.px),
          Math.abs(br.py - tl.py),
        );
        // Cut out each visited cell. Scale the cell to render units.
        const cellW = (cellSize / mapCfg.scale) * RENDER_SIZE;
        ctx.globalCompositeOperation = "destination-out";
        // Visited cells: paint a softer falloff for hotter cells (more confidently "warm").
        for (const cell of analysis.trafficGrid) {
          const top = worldToPixel(cell.x, cell.z + cellSize, mapCfg, RENDER_SIZE);
          const alpha = Math.min(1, 0.4 + Math.log10(cell.count + 1) * 0.4);
          ctx.fillStyle = `rgba(0,0,0,${alpha})`;
          ctx.fillRect(top.px, top.py, cellW, cellW);
        }
        ctx.restore();
      }
    } else if (p.heatmapMode !== "off") {
      let pts: Array<[number, number]> = [];
      let ramp = RAMP_HEAT;
      if (p.heatmapScope === "match" && p.match) {
        const md = p.match;
        if (p.heatmapMode === "traffic") {
          for (const t of Object.values(md.trails)) for (const [, x, z] of t) pts.push([x, z]);
        } else if (p.heatmapMode === "kills") {
          ramp = RAMP_KILL;
          for (const [, , code, x, z] of md.events) if (code === "K" || code === "BK") pts.push([x, z]);
        } else if (p.heatmapMode === "deaths") {
          ramp = RAMP_KILL;
          for (const [, , code, x, z] of md.events)
            if (code === "KD" || code === "BKD" || code === "S") pts.push([x, z]);
        } else if (p.heatmapMode === "loot") {
          ramp = RAMP_LOOT;
          for (const [, , code, x, z] of md.events) if (code === "L") pts.push([x, z]);
        } else if (p.heatmapMode === "storm") {
          ramp = RAMP_STORM;
          for (const [, , code, x, z] of md.events) if (code === "S") pts.push([x, z]);
        }
      } else if (p.heatmapScope === "global" && globalAggregate) {
        if (p.heatmapMode === "kills") ramp = RAMP_KILL;
        else if (p.heatmapMode === "deaths") ramp = RAMP_KILL;
        else if (p.heatmapMode === "loot") ramp = RAMP_LOOT;
        else if (p.heatmapMode === "storm") ramp = RAMP_STORM;
        pts = globalAggregate.points[p.heatmapMode] ?? [];
      }
      if (pts.length > 0) {
        // Larger radius for sparse event heatmaps so single points don't disappear.
        const sparse = p.heatmapMode !== "traffic";
        renderHeatmap(ctx, pts, mapCfg, RENDER_SIZE, {
          radius: sparse ? 38 : 22,
          intensity: sparse ? 0.45 : 0.55,
          colorScale: ramp,
        });
      }
    }

    // --- Trails ---
    if (p.match && p.showTrails) {
      const md = p.match;
      for (const [uid, trail] of Object.entries(md.trails)) {
        const part = md.participants[uid];
        if (!part) continue;
        if (part.isBot && !p.showBots) continue;
        if (!part.isBot && !p.showHumans) continue;
        const color = colorForUser(uid, part.isBot);
        ctx.strokeStyle = color;
        ctx.lineWidth = part.isBot ? 1.5 : 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        let started = false;
        let lastVisibleIdx = -1;
        for (let i = 0; i < trail.length; i++) {
          const [ts, x, z] = trail[i];
          if (ts > p.playheadMs) break;
          const { px, py } = worldToPixel(x, z, mapCfg, RENDER_SIZE);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
          lastVisibleIdx = i;
        }
        if (started) ctx.stroke();
        // Head marker
        if (lastVisibleIdx >= 0) {
          const [, x, z] = trail[lastVisibleIdx];
          const { px, py } = worldToPixel(x, z, mapCfg, RENDER_SIZE);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, part.isBot ? 3 : 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(7,9,13,0.85)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // Origin marker (faded ring)
        if (trail.length > 0) {
          const [ts0, x0, z0] = trail[0];
          if (ts0 <= p.playheadMs) {
            const { px, py } = worldToPixel(x0, z0, mapCfg, RENDER_SIZE);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    // --- Storm corridor overlay ---
    if (p.showStorm) {
      const analysis = p.manifest.mapAnalysis?.[p.mapId];
      const storm = analysis?.storm ?? null;
      if (storm && storm.confidence > 0) {
        const cx = storm.centerX;
        const cz = storm.centerZ;
        // Storm push direction (unit vector).
        const dx = storm.dirX;
        const dz = storm.dirZ;
        // Perpendicular (turn 90°): (−dz, dx).
        const px_ = -dz;
        const pz_ = dx;
        // Build a long band along the perpendicular, swept along ±dir from center.
        const half = mapCfg.scale * 0.55;
        const width = mapCfg.scale * (0.06 + storm.confidence * 0.08);
        const a = worldToPixel(cx + px_ * half - dx * width, cz + pz_ * half - dz * width, mapCfg, RENDER_SIZE);
        const b = worldToPixel(cx - px_ * half - dx * width, cz - pz_ * half - dz * width, mapCfg, RENDER_SIZE);
        const c = worldToPixel(cx - px_ * half + dx * width, cz - pz_ * half + dz * width, mapCfg, RENDER_SIZE);
        const d = worldToPixel(cx + px_ * half + dx * width, cz + pz_ * half + dz * width, mapCfg, RENDER_SIZE);
        ctx.save();
        ctx.fillStyle = `rgba(236, 72, 153, ${0.10 + storm.confidence * 0.20})`;
        ctx.strokeStyle = `rgba(236, 72, 153, ${0.45 + storm.confidence * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.lineTo(c.px, c.py);
        ctx.lineTo(d.px, d.py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Arrow from corridor center indicating push direction.
        const arrLen = mapCfg.scale * 0.18;
        const fromW = { x: cx - dx * arrLen, z: cz - dz * arrLen };
        const toW = { x: cx + dx * arrLen, z: cz + dz * arrLen };
        const from = worldToPixel(fromW.x, fromW.z, mapCfg, RENDER_SIZE);
        const to = worldToPixel(toW.x, toW.z, mapCfg, RENDER_SIZE);
        ctx.strokeStyle = "rgba(236, 72, 153, 0.95)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(from.px, from.py);
        ctx.lineTo(to.px, to.py);
        ctx.stroke();
        // Arrow head — pointer triangle at the "to" end.
        const ang = Math.atan2(to.py - from.py, to.px - from.px);
        const ah = 10;
        ctx.beginPath();
        ctx.moveTo(to.px, to.py);
        ctx.lineTo(to.px - ah * Math.cos(ang - Math.PI / 6), to.py - ah * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(to.px - ah * Math.cos(ang + Math.PI / 6), to.py - ah * Math.sin(ang + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = "rgba(236, 72, 153, 0.95)";
        ctx.fill();
        ctx.restore();
      }
    }

    // --- Events ---
    if (p.match && p.showEvents) {
      for (const [ts, uid, code, x, z] of p.match.events) {
        if (ts > p.playheadMs) break;
        const part = p.match.participants[uid];
        const isBot = part?.isBot ?? code === "BP";
        if (isBot && !p.showBots) continue;
        if (!isBot && !p.showHumans) continue;
        const { px, py } = worldToPixel(x, z, mapCfg, RENDER_SIZE);
        drawEventMarker(ctx, px, py, code);
      }
    }

    // --- POI labels (always drawn on top of everything) ---
    if (p.showPOIs) {
      const analysis = p.manifest.mapAnalysis?.[p.mapId];
      const pois = analysis?.pois ?? [];
      pois.forEach((poi, idx) => {
        const name = `${String.fromCharCode(65 + idx)}`;
        const { px, py } = worldToPixel(poi.x, poi.z, mapCfg, RENDER_SIZE);
        ctx.save();
        // Ring
        ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(7, 9, 13, 0.85)";
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.fill();
        // Letter inside
        ctx.fillStyle = "#facc15";
        ctx.font = "700 16px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, px, py + 1);
        // Caption underneath: dominant type + count
        const caption = `${poi.count.toLocaleString()} ${poi.dominant === "L" ? "loot" : poi.dominant === "BK" ? "bot-kills" : poi.dominant === "BKD" ? "deaths" : poi.dominant === "S" ? "storm" : "events"}`;
        ctx.font = "500 11px Inter, system-ui";
        ctx.fillStyle = "rgba(7,9,13,0.85)";
        const w = ctx.measureText(caption).width + 8;
        ctx.fillRect(px - w / 2, py + 18, w, 14);
        ctx.fillStyle = "#fde68a";
        ctx.fillText(caption, px, py + 27);
        ctx.restore();
      });
    }
  }, [
    imgReady,
    mapCfg,
    p.mapId,
    p.match,
    p.showHumans,
    p.showBots,
    p.showTrails,
    p.showEvents,
    p.heatmapMode,
    p.heatmapScope,
    p.playheadMs,
    p.showPOIs,
    p.showStorm,
    p.manifest.mapAnalysis,
    globalAggregate,
  ]);

  // ---- Hover tooltip world-coords ----
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!mapCfg) return;
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const u = rx;
    const v = 1 - ry;
    const x = u * mapCfg.scale + mapCfg.originX;
    const z = v * mapCfg.scale + mapCfg.originZ;
    setHover({
      x,
      z,
      pxOnScreen: { left: e.clientX - rect.left, top: e.clientY - rect.top },
    });
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg map-vignette"
    >
      <div className="checker-bg absolute inset-0 opacity-30" />
      <div className="relative" style={{ width: "min(100%, 92vh)", aspectRatio: "1 / 1" }}>
        <canvas
          ref={canvasRef}
          width={RENDER_SIZE}
          height={RENDER_SIZE}
          className="absolute inset-0 h-full w-full rounded-md shadow-2xl"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
        {/* Map name overlay */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-ink-900/80 px-2.5 py-1 text-xs text-zinc-300 backdrop-blur-sm">
          <span className="font-semibold text-accent">{mapCfg?.label ?? p.mapId}</span>
          <span className="ml-2 text-zinc-500">{RENDER_SIZE}×{RENDER_SIZE} world units · scale {mapCfg?.scale}</span>
        </div>
        {/* Match label */}
        {p.match && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-ink-900/80 px-2.5 py-1 text-[11px] text-zinc-400 backdrop-blur-sm font-mono">
            {p.match.matchId.replace(".nakama-0", "")}
          </div>
        )}
        {/* Hover tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-y-full rounded bg-ink-900/95 px-2 py-1 text-[10px] text-zinc-300 shadow-glow font-mono"
            style={{ left: hover.pxOnScreen.left + 8, top: hover.pxOnScreen.top - 6 }}
          >
            x: {hover.x.toFixed(1)} · z: {hover.z.toFixed(1)}
          </div>
        )}
        {p.loadingMatch && (
          <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">
            <div className="rounded-md bg-ink-900/80 px-3 py-1.5">Loading match…</div>
          </div>
        )}
        {!p.match && !p.loadingMatch && (
          <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">
            <div className="rounded-md bg-ink-900/80 px-3 py-1.5">Pick a match on the left to begin.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function drawEventMarker(ctx: CanvasRenderingContext2D, x: number, y: number, code: string) {
  const meta = EVENT_META[code as keyof typeof EVENT_META] ?? EVENT_META.L;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = meta.color;
  ctx.strokeStyle = "rgba(7,9,13,0.95)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = meta.color;
  ctx.shadowBlur = 8;
  const s = 6;
  switch (meta.shape) {
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "x":
      ctx.shadowBlur = 6;
      ctx.lineWidth = 3;
      ctx.strokeStyle = meta.color;
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(s, s);
      ctx.moveTo(s, -s);
      ctx.lineTo(-s, s);
      ctx.stroke();
      break;
    case "ring":
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "square":
      ctx.fillRect(-s + 1, -s + 1, (s - 1) * 2, (s - 1) * 2);
      ctx.strokeRect(-s + 1, -s + 1, (s - 1) * 2, (s - 1) * 2);
      break;
    case "bolt":
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(0, -1);
      ctx.lineTo(-2, -1);
      ctx.lineTo(s, s);
      ctx.lineTo(0, 1);
      ctx.lineTo(2, 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
  }
  ctx.restore();
}
