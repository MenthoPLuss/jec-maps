/** Downloads the published campus files. They are plain assets: no request carries a position. */
import { SCHEMA_VERSION } from "./constants";
import type { IndoorPlans, PublishedDataset } from "./published";

/** Why the campus data can't be used. */
export class DatasetError extends Error {
  constructor(public readonly kind: "offline" | "missing" | "outdated") {
    super(`Campus data: ${kind}`);
    this.name = "DatasetError";
  }
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export async function loadDataset(signal?: AbortSignal, fetcher: Fetch = fetch): Promise<PublishedDataset> {
  const data = await download("/data/core.json", signal, fetcher);
  if (!isRecord(data) || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.buildings)) {
    // Most likely an old file from the browser's cache.
    throw new DatasetError("outdated");
  }
  return data as unknown as PublishedDataset;
}

/** The floor plans of one building, or null when it has none. */
export async function loadIndoorPlans(
  dataset: Pick<PublishedDataset, "indoorLevels">,
  buildingId: string,
  signal?: AbortSignal,
  fetcher: Fetch = fetch,
): Promise<IndoorPlans | null> {
  // Only ids that the dataset lists ever become part of an address.
  if (!Object.hasOwn(dataset.indoorLevels, buildingId)) return null;

  const data = await download(`/data/indoor/${buildingId}.json`, signal, fetcher);
  if (!isRecord(data) || data.buildingId !== buildingId || !Array.isArray(data.levels)) {
    throw new DatasetError("outdated");
  }
  return data as unknown as IndoorPlans;
}

async function download(url: string, signal: AbortSignal | undefined, fetcher: Fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DatasetError("offline");
  }
  if (!response.ok) throw new DatasetError("missing");
  try {
    return await response.json();
  } catch {
    throw new DatasetError("missing");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
