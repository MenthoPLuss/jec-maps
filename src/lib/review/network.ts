/** What choosing some candidate paths would do to the network that routes use. */
import { connectedGroups } from "../data/coverage";
import type { PathFeature } from "../data/schemas";
import { polylineLengthM } from "../geo/polyline";

export interface NetworkPreview {
  /** Metres of the chosen paths together. */
  lengthM: number;
  /** Chosen paths that would not join the main network, so routes would never use them. */
  unconnected: Set<string>;
}

/**
 * `approved` are the paths that routes use today. The chosen ones count as if they
 * were approved with public access, which is the only way they can join.
 */
export function previewNetwork(approved: PathFeature[], chosen: PathFeature[]): NetworkPreview {
  const chosenIds = new Set(chosen.map((path) => path.properties.id));
  const [main = []] = connectedGroups([...approved.filter((path) => !chosenIds.has(path.properties.id)), ...chosen]);
  const inMain = new Set(main.map((path) => path.properties.id));

  return {
    lengthM: chosen.reduce((sum, path) => sum + polylineLengthM(path.geometry.coordinates), 0),
    unconnected: new Set([...chosenIds].filter((id) => !inMain.has(id))),
  };
}
