/** Talks to OpenStreetMap's Overpass service, with limits on time and retries. */
import type { LngLat } from "../../src/lib/geo/types";

export const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
export const MAX_RADIUS_M = 2_000;

/** A fixed area around the campus: the centre is public, not anyone's position. */
export function overpassQuery([lng, lat]: LngLat, radiusM: number): string {
  if (!Number.isInteger(radiusM) || radiusM < 50 || radiusM > MAX_RADIUS_M) {
    throw new Error(`The radius must be a whole number between 50 and ${MAX_RADIUS_M} metres`);
  }
  const around = `(around:${radiusM},${lat},${lng})`;
  return `[out:json][timeout:60];
(
  way["amenity"~"^(college|university)$"]${around};
  relation["amenity"~"^(college|university)$"]${around};
  way["building"]${around};
  relation["building"]["type"="multipolygon"]${around};
  way["highway"]${around};
);
out body geom;
way["highway"]${around};
node(w)["barrier"];
out body;`;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface OverpassOptions {
  endpoint?: string;
  attempts?: number;
  timeoutMs?: number;
  fetcher?: Fetch;
  /** Waiting between attempts. Tests pass a function that doesn't wait. */
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

/** Asks Overpass, a few times at most. Throws an error that a student can act on. */
export async function askOverpass(query: string, options: OverpassOptions = {}): Promise<unknown> {
  const {
    endpoint = DEFAULT_ENDPOINT,
    attempts = 3,
    timeoutMs = 90_000,
    fetcher = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = () => {},
  } = options;

  let problem = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "campus-map-importer" },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          problem = "the answer was not JSON: the server may be overloaded";
        }
      } else if (response.status === 429 || response.status >= 500) {
        problem = `the server is busy (HTTP ${response.status})`;
      } else {
        // Our mistake: asking again would not help.
        throw new OverpassError(`Overpass refused the request (HTTP ${response.status}).`);
      }
    } catch (error) {
      if (error instanceof OverpassError) throw error;
      problem =
        error instanceof Error && error.name === "TimeoutError"
          ? `no answer within ${Math.round(timeoutMs / 1000)} seconds`
          : "the server can't be reached";
    }

    if (attempt < attempts) {
      log(`Attempt ${attempt} of ${attempts} failed: ${problem}. Trying again…`);
      await sleep(attempt * 5_000);
    }
  }

  throw new OverpassError(
    `OpenStreetMap data could not be downloaded: ${problem}. Nothing was changed. Try again later, or use --input with a saved answer.`,
  );
}

export class OverpassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverpassError";
  }
}
