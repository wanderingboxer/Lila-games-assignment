#!/usr/bin/env python3
"""LILA player_data → static JSON bundles.

Reads every parquet file in `data_raw/player_data/<day>/`, groups events by
match_id, normalises timestamps to match-relative milliseconds, downsamples
per-player position trails, and writes:

  web/public/data/manifest.json
  web/public/data/matches/<match_id>.json    (one per match)
  web/public/minimaps/<...>                  (copied from raw)
  web/public/data/maps.json                  (map config: scale + origin)

The frontend consumes these as plain static files.
"""
from __future__ import annotations

import json
import math
import os
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = REPO_ROOT / "data_raw" / "player_data"
WEB_PUBLIC = REPO_ROOT / "web" / "public"
DATA_OUT = WEB_PUBLIC / "data"
MATCHES_OUT = DATA_OUT / "matches"
MINIMAPS_OUT = WEB_PUBLIC / "minimaps"

# Per-map world→pixel config, from README.md.
MAP_CONFIG = {
    "AmbroseValley": {
        "image": "/minimaps/AmbroseValley_Minimap.png",
        "scale": 900,
        "originX": -370,
        "originZ": -473,
        "size": 1024,
        "label": "Ambrose Valley",
    },
    "GrandRift": {
        "image": "/minimaps/GrandRift_Minimap.png",
        "scale": 581,
        "originX": -290,
        "originZ": -290,
        "size": 1024,
        "label": "Grand Rift",
    },
    "Lockdown": {
        "image": "/minimaps/Lockdown_Minimap.jpg",
        "scale": 1000,
        "originX": -500,
        "originZ": -500,
        "size": 1024,
        "label": "Lockdown",
    },
}

# Event-type → short code (smaller JSON payload).
EVENT_CODE = {
    "Position": "P",
    "BotPosition": "BP",
    "Kill": "K",
    "Killed": "KD",
    "BotKill": "BK",
    "BotKilled": "BKD",
    "KilledByStorm": "S",
    "Loot": "L",
}

# Sampling: drop position points closer than this from the previous kept point.
POSITION_MIN_DT_MS = 400          # don't keep >2.5 points/s
POSITION_MIN_DIST_SQ = 1.0 ** 2   # also collapse near-stationary samples


def is_bot_user(user_id: str) -> bool:
    """Bot user_ids are short numeric strings; humans are UUIDs."""
    try:
        int(user_id)
        return True
    except ValueError:
        return False


@dataclass
class Participant:
    user_id: str
    is_bot: bool
    kills: int = 0           # Kill (human killed human)
    bot_kills: int = 0       # BotKill (human killed bot)
    killed_by_human: int = 0
    killed_by_bot: int = 0
    killed_by_storm: int = 0
    loots: int = 0
    first_ts: int | None = None
    last_ts: int | None = None
    last_event_ts: int | None = None  # last non-Position event timestamp

    def as_dict(self) -> dict:
        return {
            "userId": self.user_id,
            "isBot": self.is_bot,
            "kills": self.kills,
            "botKills": self.bot_kills,
            "killedByHuman": self.killed_by_human,
            "killedByBot": self.killed_by_bot,
            "killedByStorm": self.killed_by_storm,
            "loots": self.loots,
            "firstTs": self.first_ts,
            "lastTs": self.last_ts,
        }


@dataclass
class MatchAccumulator:
    match_id: str
    map_id: str
    date: str  # YYYY-MM-DD derived from folder
    participants: dict[str, Participant] = field(default_factory=dict)
    # Trail: user_id → list of (ts_rel_ms, x, z)
    trails: dict[str, list[tuple[int, float, float]]] = field(default_factory=lambda: defaultdict(list))
    # Discrete events: list of (ts_rel_ms, user_id, code, x, z)
    events: list[tuple[int, str, str, float, float]] = field(default_factory=list)
    min_ts_ms: int | None = None
    max_ts_ms: int | None = None

    def touch(self, user_id: str) -> Participant:
        is_bot = is_bot_user(user_id)
        p = self.participants.get(user_id)
        if p is None:
            p = Participant(user_id=user_id, is_bot=is_bot)
            self.participants[user_id] = p
        return p

    def absorb_row(self, user_id: str, event: str, x: float, z: float, ts_ms: int):
        p = self.touch(user_id)
        if p.first_ts is None or ts_ms < p.first_ts:
            p.first_ts = ts_ms
        if p.last_ts is None or ts_ms > p.last_ts:
            p.last_ts = ts_ms
        if self.min_ts_ms is None or ts_ms < self.min_ts_ms:
            self.min_ts_ms = ts_ms
        if self.max_ts_ms is None or ts_ms > self.max_ts_ms:
            self.max_ts_ms = ts_ms

        if event in ("Position", "BotPosition"):
            self.trails[user_id].append((ts_ms, x, z))
            return

        # Combat / loot / storm
        code = EVENT_CODE.get(event)
        if code is None:
            return
        self.events.append((ts_ms, user_id, code, x, z))
        p.last_event_ts = ts_ms
        if event == "Kill":
            p.kills += 1
        elif event == "BotKill":
            p.bot_kills += 1
        elif event == "Killed":
            p.killed_by_human += 1
        elif event == "BotKilled":
            p.killed_by_bot += 1
        elif event == "KilledByStorm":
            p.killed_by_storm += 1
        elif event == "Loot":
            p.loots += 1


def compute_pois(
    points: list[tuple[float, float, str]],  # (x, z, code)
    *,
    cell: float = 40.0,
    min_count: int = 20,
    max_pois: int = 8,
    neighbor_radius: int = 2,
) -> list[dict]:
    """Auto-detect points-of-interest by gridding then non-maximum-suppression.

    Pure-Python, no numpy/sklearn — keeps the pipeline dependency-light.
    Returns a list of {x, z, count, dominant} dicts, sorted hottest first.
    """
    if not points:
        return []
    grid: Counter[tuple[int, int]] = Counter()
    type_grid: dict[tuple[int, int], Counter[str]] = defaultdict(Counter)
    for x, z, code in points:
        cx, cz = int(math.floor(x / cell)), int(math.floor(z / cell))
        grid[(cx, cz)] += 1
        type_grid[(cx, cz)][code] += 1

    # Non-maximum suppression: a cell is a POI seed iff it's a strict local max
    # over a (2*neighbor_radius+1)² window and has at least min_count events.
    seeds: list[tuple[int, int, int]] = []  # (count, cx, cz)
    for (cx, cz), c in grid.items():
        if c < min_count:
            continue
        is_max = True
        for dx in range(-neighbor_radius, neighbor_radius + 1):
            for dz in range(-neighbor_radius, neighbor_radius + 1):
                if dx == 0 and dz == 0:
                    continue
                if grid.get((cx + dx, cz + dz), 0) > c:
                    is_max = False
                    break
            if not is_max:
                break
        if is_max:
            seeds.append((c, cx, cz))

    seeds.sort(reverse=True)
    pois: list[dict] = []
    for c, cx, cz in seeds[:max_pois]:
        types = type_grid[(cx, cz)]
        # Roll up nearby cells into the POI so the count reflects the region,
        # not just the peak cell.
        region_count = 0
        region_types: Counter[str] = Counter()
        cx_sum = 0.0
        cz_sum = 0.0
        for dx in range(-neighbor_radius, neighbor_radius + 1):
            for dz in range(-neighbor_radius, neighbor_radius + 1):
                k = (cx + dx, cz + dz)
                if k in grid:
                    n = grid[k]
                    region_count += n
                    region_types.update(type_grid[k])
                    cx_sum += (k[0] + 0.5) * cell * n
                    cz_sum += (k[1] + 0.5) * cell * n
        if region_count == 0:
            continue
        wx = cx_sum / region_count
        wz = cz_sum / region_count
        dominant = region_types.most_common(1)[0][0]
        pois.append({
            "x": round(wx, 1),
            "z": round(wz, 1),
            "count": region_count,
            "dominant": dominant,
            "breakdown": dict(region_types),
        })
    return pois


def infer_storm_direction(
    storm_positions: list[tuple[float, float]],
    flee_vectors: list[tuple[float, float]],
) -> dict | None:
    """Estimate the storm's sweep direction.

    Players flee away from the storm front, so the average flee direction is
    opposite the storm push. We average normalised flee vectors, then flip
    that to get the storm push direction. The corridor's perpendicular axis
    + the centroid of storm-death positions gives us a band to render on the
    map.
    """
    if not flee_vectors:
        return None
    fx = 0.0
    fz = 0.0
    used = 0
    for vx, vz in flee_vectors:
        n = math.hypot(vx, vz)
        if n < 1e-3:
            continue
        fx += vx / n
        fz += vz / n
        used += 1
    if used == 0:
        return None
    fx /= used
    fz /= used
    # storm pushes opposite to flee.
    sx, sz = -fx, -fz
    sn = math.hypot(sx, sz)
    if sn < 1e-3:
        return None
    sx /= sn
    sz /= sn
    # centroid of storm-death positions = a point inside the corridor.
    if storm_positions:
        cx = sum(p[0] for p in storm_positions) / len(storm_positions)
        cz = sum(p[1] for p in storm_positions) / len(storm_positions)
    else:
        cx = 0.0
        cz = 0.0
    # "Confidence" = magnitude of averaged unit flee vector (0..1). High when
    # flees agree on a direction; low when they're scattered.
    confidence = round(math.hypot(fx, fz), 3)
    return {
        "dirX": round(sx, 3),
        "dirZ": round(sz, 3),
        "centerX": round(cx, 1),
        "centerZ": round(cz, 1),
        "sampleSize": used,
        "confidence": confidence,
    }


def build_match_insights(
    *,
    duration_ms: int,
    events: list[list],
    trails: dict[str, list[list]],
    participants: dict[str, dict],
) -> dict:
    """Compact, human-readable derivations off a single match."""

    def first_event(codes: set[str]) -> int | None:
        for t, _uid, code, _x, _z in events:
            if code in codes:
                return t
        return None

    first_loot = first_event({"L"})
    first_combat = first_event({"K", "BK", "KD", "BKD"})
    first_storm = first_event({"S"})

    # Total distance traveled per human, max + sum.
    total_distance = 0.0
    longest_human = 0.0
    busiest_human: str | None = None
    for uid, trail in trails.items():
        p = participants.get(uid)
        if not p or p.get("isBot"):
            continue
        d = 0.0
        for i in range(1, len(trail)):
            dx = trail[i][1] - trail[i - 1][1]
            dz = trail[i][2] - trail[i - 1][2]
            d += math.hypot(dx, dz)
        total_distance += d
        if d > longest_human:
            longest_human = d
            busiest_human = uid

    # Compute "wander tightness": ratio of bounding-box diagonal to total dist.
    # Small ratio = wandered a lot in a small area; high = went in a straight line.
    tightness = None
    if busiest_human and busiest_human in trails:
        trail = trails[busiest_human]
        if len(trail) >= 2:
            xs = [p[1] for p in trail]
            zs = [p[2] for p in trail]
            bbox_diag = math.hypot(max(xs) - min(xs), max(zs) - min(zs))
            if longest_human > 1:
                tightness = round(bbox_diag / longest_human, 2)

    return {
        "firstLootMs": first_loot,
        "firstCombatMs": first_combat,
        "firstStormMs": first_storm,
        "totalHumanDistance": round(total_distance, 1),
        "longestHumanDistance": round(longest_human, 1),
        "tightness": tightness,  # bbox diag / total distance: ~1 = straight line, ~0 = circling
    }


def downsample_trail(points: list[tuple[int, float, float]]) -> list[tuple[int, float, float]]:
    """Decimate by minimum time delta and minimum spatial movement.

    Always keeps first and last point so journey endpoints are visible.
    """
    if not points:
        return []
    points.sort(key=lambda p: p[0])
    kept = [points[0]]
    for ts, x, z in points[1:]:
        last_ts, last_x, last_z = kept[-1]
        dt = ts - last_ts
        dx = x - last_x
        dz = z - last_z
        if dt < POSITION_MIN_DT_MS and (dx * dx + dz * dz) < POSITION_MIN_DIST_SQ:
            continue
        kept.append((ts, x, z))
    if kept[-1] != points[-1]:
        kept.append(points[-1])
    return kept


def discover_files() -> list[tuple[str, Path]]:
    """Yield (date_str, path) for every match file in date subfolders."""
    out: list[tuple[str, Path]] = []
    for day_dir in sorted(RAW_ROOT.iterdir()):
        if not day_dir.is_dir() or day_dir.name == "minimaps":
            continue
        try:
            month, day = day_dir.name.split("_")
            # README states 2026 dataset.
            iso = f"2026-{['January','February','March','April','May','June','July','August','September','October','November','December'].index(month)+1:02d}-{int(day):02d}"
        except Exception:
            iso = day_dir.name
        for f in sorted(day_dir.iterdir()):
            if f.is_file():
                out.append((iso, f))
    return out


def process_file(path: Path, date_iso: str, matches: dict[str, MatchAccumulator]):
    table = pq.read_table(path)
    df = table.to_pandas()
    if df.empty:
        return
    # Decode event bytes once.
    df["event"] = df["event"].apply(lambda v: v.decode("utf-8") if isinstance(v, (bytes, bytearray)) else v)
    # ts column is timestamp[ms] in parquet; pandas may surface it as
    # datetime64[ms] (pandas 3) or datetime64[ns] (pandas 2). Force ms.
    ts_ms = df["ts"].astype("datetime64[ms]").astype("int64").tolist()
    user_ids = df["user_id"].tolist()
    match_ids = df["match_id"].tolist()
    map_ids = df["map_id"].tolist()
    xs = df["x"].astype("float32").tolist()
    zs = df["z"].astype("float32").tolist()
    events = df["event"].tolist()

    for i in range(len(df)):
        mid = match_ids[i]
        if mid not in matches:
            matches[mid] = MatchAccumulator(match_id=mid, map_id=map_ids[i], date=date_iso)
        elif matches[mid].date > date_iso:
            # If the match appears under an earlier folder, prefer the earlier date.
            matches[mid].date = date_iso
        matches[mid].absorb_row(user_ids[i], events[i], xs[i], zs[i], ts_ms[i])


def build():
    if not RAW_ROOT.exists():
        sys.exit(f"missing raw data at {RAW_ROOT}")

    print(f"[lila] scanning {RAW_ROOT}")
    files = discover_files()
    print(f"[lila] {len(files)} parquet files to ingest")

    matches: dict[str, MatchAccumulator] = {}
    for i, (iso, p) in enumerate(files, 1):
        process_file(p, iso, matches)
        if i % 200 == 0:
            print(f"  ingested {i}/{len(files)}")

    print(f"[lila] {len(matches)} matches assembled")

    # Reset output trees.
    if MATCHES_OUT.exists():
        shutil.rmtree(MATCHES_OUT)
    MATCHES_OUT.mkdir(parents=True, exist_ok=True)
    MINIMAPS_OUT.mkdir(parents=True, exist_ok=True)

    # Copy + resize minimaps to the canonical 1024x1024 the README documents.
    # Source images can be much larger (the dataset ships some at 9000x9000),
    # which would dominate the page weight. 1024 matches the coordinate
    # conversion formula exactly and matches what we render at.
    raw_minimaps = RAW_ROOT / "minimaps"
    if raw_minimaps.exists():
        try:
            from PIL import Image  # type: ignore
            have_pil = True
        except Exception:
            have_pil = False
        for f in raw_minimaps.iterdir():
            if not f.is_file():
                continue
            out_path = MINIMAPS_OUT / f.name
            if have_pil:
                im = Image.open(f).resize((1024, 1024), Image.LANCZOS)
                if f.suffix.lower() in (".jpg", ".jpeg"):
                    im.convert("RGB").save(out_path, "JPEG", quality=88, optimize=True)
                else:
                    im.save(out_path, "PNG", optimize=True)
                print(f"[lila] resized minimap {f.name}  ->  1024x1024")
            else:
                shutil.copy2(f, out_path)
                print(f"[lila] copied minimap {f.name} (Pillow missing → no resize)")

    # Per-map aggregates → used for cold-zone overlay, POI labels, storm dir.
    map_event_points: dict[str, list[tuple[float, float, str]]] = defaultdict(list)
    map_traffic_cells: dict[str, Counter[tuple[int, int]]] = defaultdict(Counter)
    map_storm_positions: dict[str, list[tuple[float, float]]] = defaultdict(list)
    map_storm_flees: dict[str, list[tuple[float, float]]] = defaultdict(list)
    TRAFFIC_CELL = 32.0  # world units per cell for cold-zone grid

    # Write per-match JSONs + manifest.
    manifest_matches = []
    for mid, m in matches.items():
        if m.min_ts_ms is None:
            continue
        start = m.min_ts_ms
        end = m.max_ts_ms or start
        duration_ms = end - start
        # Normalise timestamps to relative ms.
        trails_out = {}
        for uid, pts in m.trails.items():
            ds = downsample_trail(pts)
            trails_out[uid] = [[t - start, round(x, 2), round(z, 2)] for (t, x, z) in ds]

        events_out = [
            [t - start, uid, code, round(x, 2), round(z, 2)]
            for (t, uid, code, x, z) in sorted(m.events, key=lambda r: r[0])
        ]

        participants = {uid: p.as_dict() for uid, p in m.participants.items()}
        # Rebase first/last ts to relative.
        for uid, pd in participants.items():
            if pd["firstTs"] is not None:
                pd["firstTs"] -= start
            if pd["lastTs"] is not None:
                pd["lastTs"] -= start

        # ---- Map-level aggregates (for cold-zones, POIs, storm inference) ----
        for trail in trails_out.values():
            for _, x, z in trail:
                map_traffic_cells[m.map_id][(int(x // TRAFFIC_CELL), int(z // TRAFFIC_CELL))] += 1
        for _, _, code, x, z in events_out:
            if code in ("K", "BK", "KD", "BKD", "L", "S"):
                map_event_points[m.map_id].append((x, z, code))
            if code == "S":
                map_storm_positions[m.map_id].append((x, z))
                # Find the human trail this storm death sits on and grab the
                # flee direction = last two points before the storm death.
                for uid, trail in trails_out.items():
                    if len(trail) < 2:
                        continue
                    # Only consider human players for flee inference.
                    pinfo = participants.get(uid)
                    if not pinfo or pinfo.get("isBot"):
                        continue
                    last = trail[-1]
                    if math.hypot(last[1] - x, last[2] - z) < 30:
                        dvx = trail[-1][1] - trail[-2][1]
                        dvz = trail[-1][2] - trail[-2][2]
                        map_storm_flees[m.map_id].append((dvx, dvz))
                        break

        # ---- Per-match auto-insights ----
        auto = build_match_insights(
            duration_ms=duration_ms,
            events=events_out,
            trails=trails_out,
            participants=participants,
        )

        match_doc = {
            "matchId": mid,
            "mapId": m.map_id,
            "date": m.date,
            "durationMs": duration_ms,
            "participants": participants,
            "events": events_out,
            "trails": trails_out,
            "autoInsights": auto,
        }

        with open(MATCHES_OUT / f"{mid}.json", "w") as fh:
            json.dump(match_doc, fh, separators=(",", ":"))

        humans = [p for p in m.participants.values() if not p.is_bot]
        bots = [p for p in m.participants.values() if p.is_bot]
        total_kills = sum(p.kills for p in m.participants.values())
        total_bot_kills = sum(p.bot_kills for p in m.participants.values())
        total_storm = sum(p.killed_by_storm for p in m.participants.values())
        total_loot = sum(p.loots for p in m.participants.values())

        manifest_matches.append({
            "matchId": mid,
            "mapId": m.map_id,
            "date": m.date,
            "durationMs": duration_ms,
            "humanCount": len(humans),
            "botCount": len(bots),
            "kills": total_kills,
            "botKills": total_bot_kills,
            "stormDeaths": total_storm,
            "loots": total_loot,
            "eventCount": len(m.events),
            "trailPointCount": sum(len(v) for v in m.trails.values()),
        })

    # ---- Per-map analysis: POIs, cold zones, storm direction. ----
    map_analysis: dict[str, dict] = {}
    for map_id, cfg in MAP_CONFIG.items():
        pois = compute_pois(map_event_points.get(map_id, []))
        storm = infer_storm_direction(
            map_storm_positions.get(map_id, []),
            map_storm_flees.get(map_id, []),
        )
        # Coverage stats and a compact traffic grid for cold-zone overlay.
        # We snapshot the grid as a small JSON array to avoid hauling per-trail
        # data into the client just to compute negative space.
        traffic = map_traffic_cells.get(map_id, Counter())
        grid_cells = [
            {"x": cx * TRAFFIC_CELL, "z": cz * TRAFFIC_CELL, "count": c}
            for (cx, cz), c in traffic.items()
        ]
        # Bounding box of all visited cells = the implicit playable region.
        if traffic:
            xs = [cx for cx, _ in traffic.keys()]
            zs = [cz for _, cz in traffic.keys()]
            bbox = {
                "minX": min(xs) * TRAFFIC_CELL,
                "maxX": (max(xs) + 1) * TRAFFIC_CELL,
                "minZ": min(zs) * TRAFFIC_CELL,
                "maxZ": (max(zs) + 1) * TRAFFIC_CELL,
            }
        else:
            bbox = None
        map_analysis[map_id] = {
            "pois": pois,
            "storm": storm,
            "trafficCell": TRAFFIC_CELL,
            "trafficGrid": grid_cells,
            "playableBbox": bbox,
        }

    # Sort matches by date desc, then duration desc, for nice default UI ordering.
    manifest_matches.sort(key=lambda r: (r["date"], -r["durationMs"], r["matchId"]))

    dates = sorted({r["date"] for r in manifest_matches})
    maps_present = sorted({r["mapId"] for r in manifest_matches})

    manifest = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "dates": dates,
        "maps": maps_present,
        "mapConfig": MAP_CONFIG,
        "totals": {
            "matches": len(manifest_matches),
            "humans": len({p.user_id for m in matches.values() for p in m.participants.values() if not p.is_bot}),
            "bots": len({p.user_id for m in matches.values() for p in m.participants.values() if p.is_bot}),
            "events": sum(r["eventCount"] for r in manifest_matches),
            "trailPoints": sum(r["trailPointCount"] for r in manifest_matches),
        },
        "eventCodes": EVENT_CODE,
        "mapAnalysis": map_analysis,
        "matches": manifest_matches,
    }

    DATA_OUT.mkdir(parents=True, exist_ok=True)
    with open(DATA_OUT / "manifest.json", "w") as fh:
        json.dump(manifest, fh, separators=(",", ":"))
    # Also store map config as its own file for convenience.
    with open(DATA_OUT / "maps.json", "w") as fh:
        json.dump(MAP_CONFIG, fh, indent=2)

    print(f"[lila] wrote manifest.json ({len(manifest_matches)} matches)")
    print(f"[lila] wrote {len(manifest_matches)} per-match JSON files into {MATCHES_OUT}")


if __name__ == "__main__":
    build()
