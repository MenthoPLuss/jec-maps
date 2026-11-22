import type { PublishedDataset } from "../data/published";
import type { LocationSource } from "../location/types";

export interface Capabilities {
  /** Work out whether the user is on campus, and show their position. */
  presence: boolean;
  /** Offer routes. */
  guidance: boolean;
  /** Why not, in words for the user. */
  reasons: string[];
}

/**
 * Made-up or unchecked data never guides a real person, wherever they are. The fake
 * GPS may use it: nobody can get lost in a demo.
 */
export function capabilitiesOf(
  dataset: Pick<PublishedDataset, "mode" | "boundary" | "boundaryTrusted" | "live" | "routablePathIds">,
  source: LocationSource,
): Capabilities {
  if (source === "mock") {
    return {
      presence: dataset.boundary !== null,
      guidance: dataset.boundary !== null && dataset.routablePathIds.length > 0,
      reasons: dataset.boundary ? [] : ["There is no campus boundary yet."],
    };
  }
  return {
    presence: dataset.mode === "live" && dataset.boundaryTrusted,
    guidance: dataset.mode === "live" && dataset.live.available,
    reasons: dataset.live.reasons,
  };
}
