/** What the app downloads. Written by `scripts/publish-data.ts` after every check passed. */
import type {
  BoundaryFeature,
  BuildingFeature,
  EntranceFeature,
  LevelFeature,
  PathFeature,
  PlaceFeature,
  Room,
} from "./schemas";

/** Everything except the floor plans. */
export interface PublishedDataset {
  schemaVersion: number;
  datasetVersion: string;
  mode: "demo" | "live";
  title: string;
  attribution: string[];
  /** The box that frames the campus: west, south, east, north. */
  bounds: [west: number, south: number, east: number, north: number];
  boundary: BoundaryFeature | null;
  /** True when a person has reviewed the boundary and it isn't made up. */
  boundaryTrusted: boolean;
  buildings: BuildingFeature[];
  entrances: EntranceFeature[];
  places: PlaceFeature[];
  paths: PathFeature[];
  /** The only paths that routes may use. */
  routablePathIds: string[];
  rooms: Room[];
  /** Which floors of which buildings have a plan. */
  indoorLevels: Record<string, number[]>;
  /** Whether a real person may be guided with this data, and why not. */
  live: { available: boolean; reasons: string[] };
}

/** The floor plans of one building. Downloaded when they are needed. */
export interface IndoorPlans {
  buildingId: string;
  levels: { level: number; features: LevelFeature[] }[];
}
