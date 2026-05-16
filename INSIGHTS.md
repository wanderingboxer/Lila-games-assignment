# Insights — What the data says about LILA BLACK

> Three findings surfaced **using the tool itself** (loading matches, scrubbing the timeline, flipping on the global heatmap, sorting the match list by various keys). Each is concrete, evidence-backed, and actionable. Numbers are reproducible from the data bundle that ships with the repo.

---

## Insight 1 · LILA BLACK plays like a **PvE looter**, not a PvP battle royale

### What caught my eye

Sorting the match list by **"Most kills"** and toggling the **Kills heatmap (global scope)**, I expected to see PvP firefights cluster around chokepoints. Instead, the entire "Kills" overlay is bot kills — sorting by `kills` (human → human) collapses to **three matches across five days**.

### The evidence (reproducible from the bundled data)

| Metric | Value |
| --- | --- |
| Total matches in dataset | **796** |
| Matches with **at least one human-on-human kill** | **3 (0.38%)** |
| Matches with **at least one human-on-bot kill** | **605 (76.0%)** |
| Total `Kill` events (H → H) | **3** |
| Total `BotKill` events (H → B) | **2,415** |
| Ratio of PvE kills : PvP kills | **805 : 1** |

> Open any "Most kills" match (e.g. sort the left-rail by *Most kills* and click the top result) — the diamond markers on the canvas are almost exclusively orange (BotKill), with red (PvP Kill) being so rare it's an event in itself.

### Is it actionable? Yes.

**Affected metrics** if action is taken:

- **Engagements per minute** (PvP density)
- **Average match length** (PvP tends to end matches faster than extraction)
- **Day-2 / Day-7 retention** for players who came for a competitive shooter
- **Voluntary-extraction rate vs storm-death rate** (a "real" extraction shooter biases storm-death up)

**Concrete actions for the team:**

1. **Pull matchmaking data**: are queues being satisfied with mostly-empty lobbies and back-filled with bots? The single-participant majority (743/796 matches captured as `1H + 0B`) is consistent with that hypothesis.
2. **Audit bot-difficulty scaling.** Bots are the only opposition 99%+ of the time — if they're too soft, the game has no challenge; too hard and it has no PvP either.
3. **Audit map size vs lobby size.** If 30+ player matches are designed but 10 humans show up, encounter probability collapses geometrically.
4. **Telemetry gap**: 605 matches mention bots in kill events but only ~50 have bot position trails — instrumentation isn't capturing the full bot population, which makes density-balancing impossible. **First action is to fix that pipeline.**

### Why Level Design should care

Level designers tune chokepoints, sightlines, and POI proximity assuming **two parties contesting the same space**. If the production reality is one player vs scripted bots, every chokepoint-balance decision rests on a false premise. Level Design needs to know whether they're designing for the assumed PvP game or the actual PvE one — those map shapes are very different.

---

## Insight 2 · **Lockdown** and **GrandRift** are **3× more lethal to the storm** than Ambrose Valley

### What caught my eye

Switching maps in the filter while keeping the Storm heatmap on, AmbroseValley looks "clean" — barely any pink bolt markers. Lockdown and GrandRift, despite having a fraction of the match volume, show meaningfully more storm deaths *per match*.

### The evidence

| Map | Matches | Storm deaths | Storm-death rate (per match) | % of matches with ≥1 storm death |
| --- | --- | --- | --- | --- |
| **AmbroseValley** | 566 | 17 | **0.030** | **3.0%** |
| **Lockdown**     | 171 | 17 | **0.099** | **9.9%** |
| **GrandRift**    |  59 |  5 | **0.085** | **8.5%** |

> Lockdown's storm-death rate is **3.3× AmbroseValley's**. GrandRift's is **2.8×**.

This holds even though AmbroseValley sees roughly 3× the play volume — these are *normalised* rates, not raw counts.

### Is it actionable? Yes.

**Affected metrics:**

- **Extraction-success rate** (storm deaths are by definition failed extractions)
- **Session length on those maps** (storm deaths cap a match early)
- **Time-to-extract** on smaller maps
- **Re-queue probability** after a storm death (high-friction event)

**Concrete actions for the team:**

1. **Tune storm speed or grace timing on Lockdown and GrandRift downward** until the storm-death rate is within a tolerance of AmbroseValley's 3% baseline (or whatever target the design team picks).
2. Alternatively, **add more or repositioned extraction points** on those two maps — they're smaller, so the storm has less room to be forgiving.
3. **Click through individual storm-death matches in the tool** (sort by "Most storm deaths"). The Lockdown ones tend to show trails that almost reach an extraction point — i.e. players are dying *close to* extraction, which is exactly the case where shaving 5–10 seconds off the storm timer recovers most of the lost extractions without making the storm trivial.

### Why Level Design should care

Smaller maps don't get "free" parity with the flagship map — the same storm timer is twice as punishing when there's half the run-up distance. This is a **level-design knob** (extraction-point placement, safe-corridor width) before it's a balance knob. The tool makes that obvious at a glance.

---

## Insight 3 · On **AmbroseValley**, almost half of all looting happens on **6% of the map**

### What caught my eye

With the Loot heatmap on **global scope** for AmbroseValley, a small ring of bright red sits near the middle of the map. The same ring re-appears when I switch to the Kills heatmap (bots), and the same ring re-appears for the player-trail heatmap. The rest of the map is dim.

### The evidence

Binning every loot event on AmbroseValley into 50 × 50 world-unit cells:

- **Total `Loot` events on AmbroseValley:** 9,955
- **Top 10 cells (25,000 world-units² total, ~5.8% of the playable bounding box):** **4,374 loots = 43.9% of all loot on the map**
- **Top 5 cells:** all cluster in `x ∈ [−300, +150]`, `z ∈ [−300, +200]` — the same area that lights up for **bot combat** and **player traffic**.
- **Playable bounding box (from observed trails):** roughly 600 × 700 ≈ **420,000 u²**.

> So **6% of the map absorbs 44% of the looting** — and the same 6% is where the kills happen and where the players actually go. The remaining ~80% of the map is effectively dead space.

### Is it actionable? Yes.

**Affected metrics:**

- **Engagement-per-square-meter** on AmbroseValley
- **Time-to-first-encounter** (down if loot is dispersed; up if the funnel is preserved)
- **PvP-encounter probability** (the only realistic way to *increase* the 0.38% from Insight 1 is to put humans in the same place — but that's already happening; the rest of the map needs gravity)
- **Match-pace variance** (currently low; same approach every game)

**Concrete actions for the team:**

1. **Redistribute loot density.** Move ~25–30% of the loot pool out of the central funnel into 3–4 secondary clusters in the colder regions. Don't depopulate the center entirely — it's clearly working as a magnet — but break the monopoly.
2. **Add a reason to visit the cold zones.** Mission objectives, time-limited high-tier loot, or a high-density bot patrol can pull players outward.
3. **Audit traversal cost.** Players ignoring 80% of the map often signals that the cold areas are unrewarding *and* slow to traverse. Movement primitives might need a look.
4. **Use the tool's playback** on the highest-volume matches: scrub from `t=0` and watch where the human heads first. If every player makes the same first move toward the central cluster, the spawn-to-loot pathing is itself the design problem.

### Why Level Design should care

A map is a design surface — not just terrain. If half the surface is dead, the team is paying for content (assets, optimisation, QA) that the player base never touches. Fixing the loot/engagement distribution is one of the highest-ROI level-design moves available: it costs only repositioning existing content, but it doubles the effective map size for combat encounters.

---

### How to reproduce these numbers in the tool

| Insight | Steps inside the deployed tool |
| --- | --- |
| 1 | Left rail → Map: any → Sort: "Most kills" → scroll: only three matches show a red `kill` badge. Toggle Kills heatmap to confirm it's all orange (`botKill`) tile-wise. |
| 2 | Switch Map between AmbroseValley / Lockdown / GrandRift with Storm heatmap on. Hover the rail Match list while sorted by "Most storm deaths" — Lockdown / GrandRift dominate the top of the list despite their smaller match counts. |
| 3 | Map: AmbroseValley → Heatmap: Loot → Scope: "all filtered". Compare against Heatmap: Kills (same scope). The two hotspots overlap; the rest of the map is empty. |

Every other number above comes straight from `web/public/data/manifest.json` and the per-match JSON files — easy to cross-check programmatically.
