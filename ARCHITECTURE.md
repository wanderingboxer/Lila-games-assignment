# Architecture — LILA Player Journey Explorer

## What I built it with, and why

| Concern | Pick | Why |
| --- | --- | --- |
| **Frontend** | **Next.js 15 (App Router) + TypeScript + Tailwind CSS** | Type safety end-to-end matters for telemetry shapes; Tailwind keeps the dark “game-tool” aesthetic consistent without CSS bikeshedding; App Router gives a clean single-page UX with zero routing code. |
| **Rendering** | **HTML5 Canvas (single 1024² canvas)** | Trails alone are tens of thousands of points; SVG/DOM would choke. Canvas draws trails, heatmaps, and event markers in one frame at 60 fps on a laptop. |
| **Build target** | **`next export` → static `out/`** | The dataset is small. No DB, no API, no SSR. Pure static hosting → free, fast, easy to share. |
| **ETL** | **Python 3 + `pyarrow` + `pandas`** | The data ships as parquet; pyarrow reads it natively and pandas is the path of least resistance for groupby/decode. Run once, produce JSON. |
| **Hosting** | **Vercel** (static deploy) | One-click import from GitHub, permanent share URL, free for this size. Works equally well on Netlify / Cloudflare Pages / GitHub Pages — nothing in the build is Vercel-specific. |

## Data flow

```
data_raw/player_data/<day>/*.nakama-0  (parquet)
              │
              ▼  pipeline/preprocess.py   (offline, idempotent)
              │     · decode `event` bytes → string
              │     · group by match_id (a match spans 1..N participant files)
              │     · normalise ts to ms relative to match start
              │     · downsample Position trails by Δt + Δdist
              │     · derive per-participant kill/death/loot/storm counters
              │
              ▼
web/public/data/
   manifest.json                      (~190 KB)  — every match summary + map config
   matches/<match_id>.json   (one per match, ~3–8 KB)
web/public/minimaps/
   AmbroseValley_Minimap.png · GrandRift_Minimap.png · Lockdown_Minimap.jpg

              │
              ▼  npm run build (next export)
              │     · React shell + lib/ utilities → JS bundle (~110 KB gz)
              │     · `out/` is the entire deployable site
              │
              ▼  Vercel static deploy
                    User opens URL → fetches manifest.json (lazy) →
                    picks a match → fetches matches/<id>.json (cached) →
                    Canvas draws trails, events, heatmap, playhead
```

The frontend never parses parquet, never decodes bytes, never sees raw ts — those concerns are entirely upstream of the browser.

## Mapping world coordinates to the minimap (the tricky part)

The dataset README is explicit; my job was to implement it precisely. Each map has a `(scale, originX, originZ)`:

| Map | scale | originX | originZ |
| --- | --- | --- | --- |
| AmbroseValley | 900  | −370 | −473 |
| GrandRift    | 581  | −290 | −290 |
| Lockdown     | 1000 | −500 | −500 |

The conversion lives in **`web/src/lib/coords.ts`**:

```ts
u  = (worldX − originX) / scale          // 0..1 across the image
v  = (worldZ − originZ) / scale
px =  u           * renderSize
py = (1 − v)      * renderSize           // y-axis flipped — image origin is top-left
```

A few decisions on top of that:

- **`y` is elevation, not 2D position.** The README warns this. I drop `y` everywhere except in tooltips/data exploration tools — it's never used for plotting.
- **Single source of truth.** The same `worldToPixel(x, z, cfg, size)` is used by **trails**, **event markers**, and **the heatmap painter** so they can never drift.
- **Pre-baked into JSON.** I do **not** convert at preprocessing time. The JSON stores world coords; conversion happens in the renderer. That means swapping the minimap or recalibrating any of the three map configs is a one-line config change, no re-ETL needed.
- **Validated empirically.** I projected every event from a 200-match sample onto UV space and confirmed `u, v ∈ [0.05, 0.93]` on every map — all points land inside the image with reasonable margin. (See the run log in this conversation.)

The `pixelToWorld` inverse is also in `coords.ts` and powers the hover tooltip ("x: 56.2 · z: −123.7").

## Assumptions where data was ambiguous

| Where data was unclear | What I did |
| --- | --- |
| The README claims `ts` is "ms elapsed within the match" but values look like epoch-relative timestamps (`1970-01-21 11:52:…`). | Treated `ts` as monotonic within a match. Normalised per match by subtracting `min(ts)` across all rows in that match — that gives a true match-relative timeline regardless of what the absolute origin is. |
| Pandas 3.0 surfaces `timestamp[ms]` as `datetime64[ms]`; older pandas uses `[ns]`. Casting via `.astype('int64')` gives **different units in each**, which silently broke duration calculation. | Coerce explicitly via `df['ts'].astype('datetime64[ms]').astype('int64')` so it's always ms. |
| Many matches have only one participant file. 743/796 matches are `1H + 0B` even though they contain `BotKilled`/`BotKill` events. | Treated bots-as-mentioned-but-not-tracked as a known instrumentation gap: their kill/death *events* are counted, but their *position trails* are simply absent. The UI shows "humanCount / botCount" reflecting actual tracked participants, not the implied roster. |
| Multi-file matches sometimes straddle two day folders. | The earlier folder wins as the match's nominal date — I picked the minimum, so a match is always filed under the day it started. |
| Match durations are very short (median ~380 ms). | Treated this as the data we have, not a bug. The Timeline scrubber works fine at sub-second resolution because playback speed is a multiplier on real time, not match time. |
| Filename suffix `.nakama-0` is in the `match_id` column too. | Kept it in the canonical ID for round-trip integrity, stripped it for display only. |

## Major tradeoffs

| Decision | Considered | Picked | Why |
| --- | --- | --- | --- |
| **How to ship the data** | (a) Static JSON, (b) DuckDB-WASM on raw parquet, (c) FastAPI + parquet server | **(a) Static JSON** | Dataset is 27 MB raw / 4.5 MB preprocessed. (b) adds 5 MB of WASM and complexity for no end-user gain at this scale. (c) adds a backend to maintain and host. |
| **How to render** | (a) Canvas, (b) SVG with React per-element, (c) WebGL via deck.gl | **(a) Canvas** | (b) is fine for hundreds of points but tens of thousands of trail points kill the DOM. (c) is overkill — deck.gl pays off at millions of points. Canvas is the right rung on the ladder. |
| **State management** | Redux/Zustand vs plain React | **Plain React** | One page, one user, ~12 pieces of UI state. Anything more is dead weight. |
| **CSS** | CSS Modules vs Tailwind vs Vanilla Extract | **Tailwind** | Lets one engineer ship a polished dark UI fast. Component count is small enough that "utility soup" is not a maintenance worry. |
| **Match payload shape** | Verbose JSON objects vs tuple arrays | **Tuple arrays** for `events`/`trails`, objects for participants/meta | A 30 KB match payload becomes 7 KB when events are `[ts, uid, code, x, z]` instead of `{ts, userId, code, x, z}`. Negligible code cost; large network cost saved on the global heatmap which loads many matches. |
| **Heatmap implementation** | (a) Server-side density precompute, (b) GL-based KDE, (c) additive gradients + ramp on Canvas | **(c)** | Static site rules out (a); (b) is heavy and doesn't pay back here. (c) is ~80 lines of `lib/heatmap.ts` and looks great. |
| **Default match selection** | First in list / random / heaviest | **Heaviest** (most events, then longest) | Lands the user on something visually interesting, not an empty match. |
| **Where heatmap data lives** | Always per-match / always global / both | **Both, user-toggleable** | Per-match shows the story of one game. "All filtered" is what answers the level-design question "where on this map does X actually happen". |

## Beyond-the-spec features (and how they work)

| Feature | Where it lives | How it works in one sentence |
| --- | --- | --- |
| **Cold-zones overlay** | `MapViewport.tsx` + `mapAnalysis.trafficGrid` in manifest | Paint a violet wash over the playable bbox, then `destination-out` punch holes at every cell with traffic — what remains is dead space. |
| **Auto-POI detection** | `pipeline/preprocess.py :: compute_pois()` | Pure-Python grid + non-maximum suppression over event positions per map, keeps top-N seeds, rolls neighbours into a labelled region with a dominant event type. |
| **Storm-corridor inference** | `pipeline/preprocess.py :: infer_storm_direction()` | For every human storm-death, take the player's last velocity vector (= flee direction). Average normalised flees, invert → storm push direction. Confidence = magnitude of the averaged unit vectors (low when flees disagree). |
| **Per-match auto-insights** | `pipeline/preprocess.py :: build_match_insights()` + `components/AutoInsights.tsx` | First-event timestamps, total human distance via path-length on trails, tightness = bbox-diagonal ÷ total distance. Frontend turns these into narrative bullets. |
| **Shareable deep-link URLs** | `lib/url-state.ts` | Throttled `replaceState` writes a small `?m=…&hm=…&t=…` query string; on mount, `readUrlState()` rehydrates every UI control. |
| **Keyboard shortcuts** | `lib/keyboard.ts` + `components/HelpOverlay.tsx` | Single `keydown` listener with sensible no-hijack on input focus. `?` opens a modal listing all bindings. |
| **PNG snapshot export** | `page.tsx :: snapshot()` | Composes the live `<canvas>` with a caption strip (map name + match id + heatmap mode) into a new canvas, then `toBlob()` → download. |

## What would change at scale

If the dataset grew 10×:

- Move the ETL output to **per-match parquet on S3** instead of JSON in the repo.
- Replace the static JSON manifest with a **DuckDB-WASM** query layer reading parquet directly in the browser — pays off >>50 MB.
- Add a **/api/match/[id]** route that streams the trail for very long matches.
- Pre-compute **global heatmap density grids** offline and ship them as 256×256 PNGs (no client compute).

Everything in the current build is ready for these swaps because rendering and data ingest are cleanly separated by `lib/data.ts`.
