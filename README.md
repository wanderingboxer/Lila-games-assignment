# LILA Player Journey Explorer

> Built for the **LILA Games Product Engineer written test**.
> An interactive, browser-based tool for the **Level Design team** to explore
> player-telemetry data from **LILA BLACK** (extraction shooter).

| | |
| --- | --- |
| **Live URL** | https://lila-games-assignment-jet.vercel.app/ |
| **Stack** | Next.js 15 (App Router, static export) · TypeScript · Tailwind CSS · HTML5 Canvas · Python 3 (`pyarrow` / `pandas`) for ETL |
| **Hosting target** | Vercel (or any static host — the build is `next export`) |

## What it does

Open a match on any of the three maps and you get:

### Core
- **The right minimap** with **world coordinates correctly projected** onto the 1024 × 1024 image (see [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the math).
- **Per-player journey trails** drawn live, color-coded per player. Humans use warm hues (amber/orange); **bots use cool hues (sky/cyan)** so you can tell them apart at a glance.
- **Event markers** for every discrete event — diamonds for kills, X-marks for deaths, bolts for storm deaths, squares for loot — each in a distinct color (see in-app **Legend** panel).
- **Filters** for **Map → Date → Match**, plus toggles for humans / bots / trails / events.
- A **timeline scrubber** with **play / pause / speed (¼× → 4×)** so you can watch a match unfold over time. The scrubber rail shows every discrete event as a colored tick.
- **Heatmaps** for **Traffic / Kills / Deaths / Loot / Storm**, scoped either to the **current match** or to **all filtered matches on the selected map** (the global scope lets a designer see where the *whole* map gets used).
- A **Stats panel** with per-match KPIs, a sortable **Participants** list, and a chronological **Event log**.

### Beyond the requirements

A few things I built because they make this useful for a Level Designer rather than just a tech demo:

- **Cold-zones overlay** — the *inverse* of the traffic heatmap. Shows the parts of the map that **no one ever visits**, which is what a Level Designer actually needs to find dead content. Toggleable under **Heatmap → Cold zones**.
- **Auto-detected POIs** — clusters every map's events into the top hotspots and labels them **A, B, C…** on the minimap with a per-POI caption (`1,335 loot`, `488 bot-kills`, etc.). Toggleable with **P**.
- **Storm-corridor inference** — derives the storm's sweep direction from human flee vectors at storm-death moments, then renders the inferred corridor + push arrow on the minimap with a confidence-scaled tint. Toggleable with **C**. Pure data-derived; not in the parquet.
- **Per-match auto-insights** — every match summarises itself: first-loot time, first-combat time, total human distance traveled, motion tightness ratio (straight push vs circling), loot velocity, combat outcome.
- **Shareable deep-link URLs** — every filter, toggle, heatmap mode, and even the timeline playhead position is serialised into the URL. Copy the address bar and you've sent the exact view you're looking at to a teammate.
- **Keyboard shortcuts** — `Space` to play/pause, `←/→` to scrub, `[/]` to jump events, `H` to cycle heatmaps, `M` to cycle maps, `P` POIs, `C` storm corridor, `S` to save PNG, `?` for help.
- **PNG snapshot export** — captures the current map view (heatmap, trails, POIs, all overlays) with a caption strip that says which map, match and heatmap, so designers can paste it into a deck or doc.

## Feature walkthrough

A guided tour of the deployed tool. Each step is something a reviewer (or Level Designer) can do without my help, in this order:

### 1 · Land on the page
- The left rail shows the **filter stack** (Map → Date → Match), plus toggle chips and the Heatmap selector.
- The center renders the chosen map's minimap with all selected overlays on a 1024×1024 canvas.
- The right rail shows match metadata, the **Auto-insights card**, the per-event legend, and global rollups.
- Default: **AmbroseValley**, all dates, heaviest match auto-selected.

### 2 · Filter to a specific match
1. Click a map button — the match list refreshes to that map only.
2. Click a date chip — list narrows further.
3. Click any match in the list — the right rail repopulates and the canvas redraws.
4. Sort the list with the dropdown: **Most events / Most kills / Most storm deaths / Longest / Most players** — pick "Most storm deaths" on Lockdown to see the storm-corridor effect.
5. Use the **search box** to filter by match-id substring.

### 3 · Verify humans vs bots
- Trails are **warm hues (amber/orange) for humans**, **cool hues (sky/cyan) for bots**.
- Toggle **Humans** / **Bots** to isolate one side at a time.
- Bots have **numeric** user-ids (`1429`, `1432`…) shown in the participant list; humans have UUIDs.

### 4 · Inspect events
- Event markers on the canvas (toggle **Events** off and on to confirm):
  - 🔶 **Diamond** = kill (red = human, orange = bot)
  - ❌ **X** = death (dark red = by human, purple = by bot)
  - ⚡ **Bolt** = killed by storm (pink)
  - 🟦 **Square** = loot pickup (cyan)
- Hover the canvas: tooltip shows **live world coordinates** (x, z) — sanity-check coord mapping.
- Hover a tick on the timeline rail: native browser tooltip shows event type + relative time.

### 5 · Play back the match
- Click **▶ Play** in the timeline or press **Space**.
- Speeds: ¼× / ½× / 1× / 2× / 4× (click the speed chip or use no shortcut for it).
- Press **`[`** / **`]`** to **jump to the previous / next discrete event**.
- Press **Home** to restart, **End** to jump to the finish.
- Each colored tick on the rail is an event — color matches the legend.

### 6 · Toggle heatmaps (the headline insight feature)
Cycle with **H**, or use the buttons:
- **Off** — clean trails only.
- **Traffic** — where players move (use **Scope: all filtered** to see the entire map's traffic).
- **Cold zones** — *inverse* — violet over the parts of the map nobody visits. Toggleable per-map. Try AmbroseValley to immediately see the dead 80% of the map.
- **Kills / Deaths / Loot / Storm** — separate density layers, each with its own color ramp.
- Scope: **this match** vs **all filtered** — the latter aggregates up to 400 matches lazily and is what makes the cold-zone and global-pattern views work.

### 7 · Cross-check with overlays
- **P** toggles **POI labels** — letters A–H mark the top auto-detected event clusters with a caption like `3,252 loot`. AmbroseValley's central funnel is **B**.
- **C** toggles the **Storm corridor** — the inferred storm push direction, tinted by confidence. Best example: Lockdown (confidence 0.45) shows a clear east-southeast push.

### 8 · Read the Auto-insights card
For any selected match, the right-rail card reads like a story:
> *"First loot at 34 ms. First combat at 303 ms. Storm caught a player at 878 ms (failed extraction). Humans moved 1,737 units total. Tight wandering (tightness 0.28) — circling a small area. Loot velocity: 38 pickups/sec — active looting. Combat outcome: 4 kills, 1 death."*

### 9 · Share the exact view
- Click **🔗 Share** in the header — copies a URL that encodes the **map, date, match, heatmap mode + scope, every toggle, and the playhead timestamp**.
- Open that URL anywhere: the same view rehydrates.

### 10 · Export a snapshot
- Click **📸 PNG** in the header (or press **S**).
- Downloads `lila-<map>-<match>-<heatmap>.png` with a caption strip so the image is self-describing in a deck.

### 11 · Keyboard reference
Click **? Help** in the header — modal lists every shortcut. Inputs / selects don't hijack keys.

---

## How to run it locally

### Prerequisites

- **Python 3.10+** with `pip` (for the ETL)
- **Node 20+** with npm (for the web app)

### One-time setup

```bash
# 1. Drop the raw dataset where the pipeline expects it:
#      Lila-games-assignment/data_raw/player_data/
#        ├── February_10/  ...  February_14/
#        └── minimaps/
#
# (The zip you downloaded should expand to a `player_data/` folder; place it
# at `data_raw/player_data/`.)

# 2. Install Python deps (one-time)
pip install pyarrow pandas

# 3. Install web app deps (one-time)
cd web && npm install
```

### Build & run

```bash
# From repo root:
python3 pipeline/preprocess.py     # parquet → /web/public/data/{manifest,matches/*}.json
cd web
npm run dev                        # http://localhost:3000   (live reload)
# or:
npm run build                      # produces /web/out/ — fully static
npx serve@latest out               # serve the static export
```

`npm run build` runs `next build` with `output: "export"`, so the entire app
lands in `web/out/` as plain HTML/JS/JSON ready for any static host.

## Deploying to Vercel

The tool is set up to deploy as a static Next.js site:

1. Push the repo to GitHub.
2. In Vercel, click **Import Project** and pick the repo.
3. Set the **Root Directory** to `web/`.
4. Vercel detects Next.js automatically. Build command: `npm run build`. Output: `out/`.
5. Click **Deploy**. You'll get a permanent URL (`https://<project>.vercel.app`).

The `vercel.json` at the repo root tells Vercel exactly that, so the import flow is one-click.

### Why no backend?

The full dataset is small (89,104 events across 796 matches → ~4.5 MB of preprocessed JSON, plus ~24 MB of minimap PNGs). Preprocessing once to static JSON keeps hosting free, removes a moving part, and gives the tool a sub-second cold start.

If the dataset grew by an order of magnitude, the natural next step is documented in `ARCHITECTURE.md`.

## Repo layout

```
.
├── pipeline/
│   └── preprocess.py            # parquet → static JSON (offline ETL)
├── web/
│   ├── public/
│   │   ├── minimaps/            # 3 PNG/JPG images (copied by ETL)
│   │   └── data/                # manifest.json + matches/<id>.json
│   ├── src/
│   │   ├── app/                 # Next.js App Router pages + styles
│   │   ├── components/          # ControlPanel, MapViewport, Timeline, …
│   │   └── lib/                 # coords.ts, heatmap.ts, types.ts, …
│   ├── next.config.mjs          # output: "export"  →  static site
│   ├── tailwind.config.ts
│   └── package.json
├── data_raw/                    # ← put the unpacked dataset here (gitignored)
├── ARCHITECTURE.md              # one-page architecture write-up
├── INSIGHTS.md                  # three data-driven findings
├── vercel.json                  # tells Vercel to use web/ as root
└── README.md                    # you are here
```

## Environment variables

None required. The site is fully static.

## Re-generating the data bundle

Anytime new parquet drops in `data_raw/player_data/<MonthName_DD>/`, just re-run:

```bash
python3 pipeline/preprocess.py
```

It rewrites `web/public/data/manifest.json` and `web/public/data/matches/*.json`, recopies minimaps, and the next `npm run build` will pick the new bundle up.

## Notes

- The data is committed to the repo (it's small) so Vercel can build without
  re-running the ETL. If that ever changes, push the parquet to object
  storage, run the ETL in CI, and have Vercel pull the resulting JSON.
- The `event` column in parquet is stored as `bytes`. The ETL decodes once,
  so the frontend never sees bytes.
- Match `ts` is parquet `timestamp[ms]`. Pandas 3.0 and Pandas 2.x surface
  this differently (`datetime64[ms]` vs `datetime64[ns]`); the ETL coerces
  to `datetime64[ms]` before casting to int — see `pipeline/preprocess.py`.

## Submission checklist (mapped to the assignment)

Every item from the take-home doc's checklist, with where to find it satisfied:

| Assignment item | Where it lives |
| --- | --- |
| Load and parse parquet data | `pipeline/preprocess.py` (Python + pyarrow) |
| Player journeys on correct minimap with proper coord mapping | `web/src/lib/coords.ts` (formula from dataset README); rendered in `MapViewport.tsx` |
| Humans vs bots distinguished visually | Warm-vs-cool hue split in `web/src/lib/colors.ts :: colorForUser`; trail head sizes differ |
| Kill, death, loot, storm events as distinct markers | `EVENT_META` in `web/src/lib/colors.ts` (diamond / X / square / bolt) + the in-app **Legend** |
| Filtering by map / date / match | `web/src/components/ControlPanel.tsx` |
| Timeline / playback over time | `web/src/components/Timeline.tsx` (play, pause, 0.25×–4×, event ticks) |
| Heatmaps: kills, deaths, traffic, plus loot, storm, **and cold zones** | `web/src/lib/heatmap.ts`; toggled in `ControlPanel.tsx` |
| Hosted / shareable URL | Deploy to Vercel using `vercel.json` (step-by-step above); the URL itself encodes shareable state |
| README with tech stack, setup, env vars | This file |
| ARCHITECTURE.md (one page): stack+why, data flow, coord mapping, assumptions, tradeoffs | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| 3 insights with evidence, actionable items, why a Level Designer cares | [`INSIGHTS.md`](./INSIGHTS.md) |
| Walkthrough of all major features | "Feature walkthrough" section above |

## Credits

Built solo against the LILA Games Product Engineer take-home, with the LILA
BLACK dataset README as the single source of truth for coordinate mapping
and schema.
