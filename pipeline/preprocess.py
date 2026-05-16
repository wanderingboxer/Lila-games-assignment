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
from collections import defaultdict
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

        match_doc = {
            "matchId": mid,
            "mapId": m.map_id,
            "date": m.date,
            "durationMs": duration_ms,
            "participants": participants,
            "events": events_out,
            "trails": trails_out,
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
