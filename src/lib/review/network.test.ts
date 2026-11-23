import { describe, expect, it } from "vitest";

import type { PathFeature } from "../data/schemas";
import { published, reviewedFiles } from "../data/testing";
import type { LngLat } from "../geo/types";
import { previewNetwork } from "./network";

const { core } = published(reviewedFiles());
const approved = core.paths.filter((path) => core.routablePathIds.includes(path.properties.id));

function path(id: string, fromNode: string, toNode: string, coordinates: LngLat[]): PathFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: {
      id,
      fromNode,
      toNode,
      kind: "footway",
      access: "unknown",
      direction: "both",
      layer: 0,
      source: "osm",
      placeholder: false,
      reviewStatus: "unreviewed",
    },
  };
}

describe("previewNetwork", () => {
  const joined = approved[0];
  const start = joined.geometry.coordinates[0];
  const spur = path("spur", joined.properties.fromNode, "spur-end", [start, [start[0] + 0.0002, start[1]]]);
  const island = path("island", "far-a", "far-b", [[94.26, 26.75], [94.2602, 26.75]]);

  it("says which chosen paths would not join the network", () => {
    const preview = previewNetwork(approved, [spur, island]);

    expect([...preview.unconnected]).toEqual(["island"]);
    expect(preview.lengthM).toBeGreaterThan(35);
  });

  it("takes the longest group as the network while nothing is approved", () => {
    const longer = path("longer", "far-b", "far-c", [[94.2602, 26.75], [94.261, 26.75]]);

    expect([...previewNetwork([], [spur, island, longer]).unconnected]).toEqual(["spur"]);
  });
});
