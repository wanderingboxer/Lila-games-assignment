"use client";

import { useEffect, useRef } from "react";

export interface SyncedState {
  map: string;
  date: string;
  match: string | null;
  hm: string; // heatmap mode
  scope: string; // match | global
  trails: boolean;
  events: boolean;
  humans: boolean;
  bots: boolean;
  pois: boolean;
  storm: boolean;
  t: number; // playhead ms
}

const SHORT_KEYS: Record<keyof SyncedState, string> = {
  map: "m",
  date: "d",
  match: "id",
  hm: "h",
  scope: "s",
  trails: "tr",
  events: "ev",
  humans: "hu",
  bots: "bo",
  pois: "p",
  storm: "st",
  t: "t",
};

export function readUrlState(): Partial<SyncedState> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Partial<SyncedState> = {};
  for (const [k, sk] of Object.entries(SHORT_KEYS)) {
    const v = p.get(sk);
    if (v == null) continue;
    if (k === "t") (out as any)[k] = Number(v);
    else if (["trails", "events", "humans", "bots", "pois", "storm"].includes(k))
      (out as any)[k] = v === "1";
    else (out as any)[k] = v;
  }
  return out;
}

/** Throttled URL writer. Uses replaceState so the back button stays meaningful. */
export function useUrlSync(state: SyncedState) {
  const last = useRef<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      const def: SyncedState = {
        map: "AmbroseValley",
        date: "all",
        match: null,
        hm: "off",
        scope: "global",
        trails: true,
        events: true,
        humans: true,
        bots: true,
        pois: true,
        storm: false,
        t: 0,
      };
      for (const k of Object.keys(SHORT_KEYS) as Array<keyof SyncedState>) {
        const v = state[k];
        const d = def[k];
        if (v === d) continue;
        if (v === null) continue;
        if (typeof v === "boolean") params.set(SHORT_KEYS[k], v ? "1" : "0");
        else if (typeof v === "number") params.set(SHORT_KEYS[k], Math.round(v).toString());
        else params.set(SHORT_KEYS[k], String(v));
      }
      const q = params.toString();
      const next = q ? `?${q}` : window.location.pathname;
      if (last.current === next) return;
      last.current = next;
      window.history.replaceState(null, "", next);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [state]);
}
