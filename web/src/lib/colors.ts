import type { EventCode } from "./types";

export const EVENT_META: Record<
  EventCode,
  { label: string; color: string; shape: "diamond" | "circle" | "x" | "ring" | "bolt" | "square" }
> = {
  P: { label: "Position (human)", color: "#fef08a", shape: "circle" },
  BP: { label: "Position (bot)", color: "#7dd3fc", shape: "circle" },
  K: { label: "Kill (human → human)", color: "#ff3d3d", shape: "diamond" },
  KD: { label: "Killed (by human)", color: "#7f1d1d", shape: "x" },
  BK: { label: "Bot kill (human → bot)", color: "#fb923c", shape: "diamond" },
  BKD: { label: "Killed by bot", color: "#a855f7", shape: "x" },
  S: { label: "Killed by storm", color: "#ec4899", shape: "bolt" },
  L: { label: "Loot picked up", color: "#22d3ee", shape: "square" },
};

export const TRAIL_COLOR = {
  human: "#fde68a",
  bot: "#38bdf8",
};

// Stable per-user color for trail variety. Hash-based so it's deterministic.
export function colorForUser(userId: string, isBot: boolean): string {
  // Cheap hash → hue
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  // Bots: cool blues/cyans. Humans: warm ambers/oranges.
  if (isBot) {
    const sat = 70;
    const light = 60;
    return `hsl(${180 + (hue % 60)}, ${sat}%, ${light}%)`;
  }
  return `hsl(${30 + (hue % 50)}, 85%, ${55 + (hue % 15)}%)`;
}
