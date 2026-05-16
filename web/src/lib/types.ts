export type EventCode = "P" | "BP" | "K" | "KD" | "BK" | "BKD" | "S" | "L";

export interface MapConfig {
  image: string;
  scale: number;
  originX: number;
  originZ: number;
  size: number;
  label: string;
}

export interface ManifestMatch {
  matchId: string;
  mapId: string;
  date: string;
  durationMs: number;
  humanCount: number;
  botCount: number;
  kills: number;
  botKills: number;
  stormDeaths: number;
  loots: number;
  eventCount: number;
  trailPointCount: number;
}

export interface Manifest {
  generatedAt: string;
  dates: string[];
  maps: string[];
  mapConfig: Record<string, MapConfig>;
  totals: { matches: number; humans: number; bots: number; events: number; trailPoints: number };
  eventCodes: Record<string, EventCode>;
  matches: ManifestMatch[];
}

export interface Participant {
  userId: string;
  isBot: boolean;
  kills: number;
  botKills: number;
  killedByHuman: number;
  killedByBot: number;
  killedByStorm: number;
  loots: number;
  firstTs: number | null;
  lastTs: number | null;
}

// Tuple shape from JSON: [tsRelMs, x, z]
export type TrailPoint = [number, number, number];

// Tuple shape from JSON: [tsRelMs, userId, code, x, z]
export type MatchEvent = [number, string, EventCode, number, number];

export interface MatchData {
  matchId: string;
  mapId: string;
  date: string;
  durationMs: number;
  participants: Record<string, Participant>;
  events: MatchEvent[];
  trails: Record<string, TrailPoint[]>;
}

export type HeatmapMode = "off" | "traffic" | "kills" | "deaths" | "loot" | "storm";
