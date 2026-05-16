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

export interface POI {
  x: number;
  z: number;
  count: number;
  dominant: EventCode;
  breakdown: Record<string, number>;
}

export interface StormInference {
  dirX: number;
  dirZ: number;
  centerX: number;
  centerZ: number;
  sampleSize: number;
  confidence: number;
}

export interface MapAnalysis {
  pois: POI[];
  storm: StormInference | null;
  trafficCell: number;
  trafficGrid: Array<{ x: number; z: number; count: number }>;
  playableBbox: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

export interface Manifest {
  generatedAt: string;
  dates: string[];
  maps: string[];
  mapConfig: Record<string, MapConfig>;
  totals: { matches: number; humans: number; bots: number; events: number; trailPoints: number };
  eventCodes: Record<string, EventCode>;
  mapAnalysis: Record<string, MapAnalysis>;
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

export interface MatchAutoInsights {
  firstLootMs: number | null;
  firstCombatMs: number | null;
  firstStormMs: number | null;
  totalHumanDistance: number;
  longestHumanDistance: number;
  tightness: number | null;
}

export interface MatchData {
  matchId: string;
  mapId: string;
  date: string;
  durationMs: number;
  participants: Record<string, Participant>;
  events: MatchEvent[];
  trails: Record<string, TrailPoint[]>;
  autoInsights?: MatchAutoInsights;
}

export type HeatmapMode = "off" | "traffic" | "kills" | "deaths" | "loot" | "storm" | "cold";
