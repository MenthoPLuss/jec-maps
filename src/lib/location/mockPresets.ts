/** Ready-made situations for the fake GPS, worked out from whatever dataset is loaded. */
import { containsPoint, nearestEdgePoint } from "../geo/area";
import { bearingDeg, destinationPoint, distanceM } from "../geo/distance";
import type { LngLat } from "../geo/types";
import type { PublishedDataset } from "../data/published";
import type { MockStep } from "./mockProvider";

export interface MockPreset {
  id: string;
  name: string;
  steps: MockStep[];
}

const calm: MockStep = {
  do: (gps) => {
    gps.setAccuracy(8);
    gps.setJitter(0);
    gps.setSignal(true);
  },
};

export function mockPresets(dataset: PublishedDataset): MockPreset[] {
  const { boundary } = dataset;
  if (!boundary) return [];

  const centre = middleOf(dataset.bounds);
  const gate = dataset.places.find((place) => place.properties.category === "gate")?.geometry.coordinates ?? nearestEdgePoint(boundary.geometry, centre);
  const outwards = bearingDeg(centre, gate);
  const outside = (metres: number) => destinationPoint(gate, outwards, metres);
  const inside = insidePoint(boundary.geometry, gate, centre);
  const door = dataset.entrances.find((entrance) => entrance.properties.indoorNodeId) ?? dataset.entrances[0];
  const between = betweenTwoBuildings(dataset);

  const presets: MockPreset[] = [
    {
      id: "far-away",
      name: "Far outside (2.3 km)",
      steps: [calm, { do: (gps) => gps.teleport(outside(2_300)) }],
    },
    {
      id: "walk-in",
      name: "Outside → into campus",
      steps: [
        calm,
        {
          do: (gps) => {
            gps.setWalkSpeed(8);
            gps.walk([outside(120), gate, inside]);
          },
          thenWaitForWalk: true,
        },
        { do: (gps) => gps.setWalkSpeed(1.4) },
      ],
    },
    {
      id: "walk-out",
      name: "Campus → outside",
      steps: [
        calm,
        {
          do: (gps) => {
            gps.setWalkSpeed(8);
            gps.walk([inside, gate, outside(150)]);
          },
          thenWaitForWalk: true,
        },
        { do: (gps) => gps.setWalkSpeed(1.4) },
      ],
    },
    {
      id: "on-campus",
      name: "Standing on campus",
      steps: [calm, { do: (gps) => gps.teleport(inside) }],
    },
    {
      id: "boundary-jitter",
      name: "Jitter at the boundary",
      steps: [
        calm,
        {
          do: (gps) => {
            gps.teleport(nearestEdgePoint(boundary.geometry, gate));
            gps.setAccuracy(18);
            gps.setJitter(15);
          },
        },
      ],
    },
    {
      id: "poor-accuracy",
      name: "Very rough signal (120 m)",
      steps: [calm, { do: (gps) => gps.setAccuracy(120) }],
    },
    {
      id: "signal-lost",
      name: "Signal lost here",
      steps: [{ do: (gps) => gps.setSignal(false) }],
    },
    {
      id: "disconnected",
      name: "Position unavailable",
      steps: [
        {
          do: (gps) => {
            gps.setSignal(false);
            gps.fail("unavailable");
          },
        },
      ],
    },
  ];

  if (between) {
    presets.push({
      id: "two-buildings",
      name: "Between two buildings",
      steps: [calm, { do: (gps) => gps.teleport(between) }],
    });
  }
  if (door) {
    const step = destinationPoint(door.geometry.coordinates, bearingDeg(door.geometry.coordinates, centre), 12);
    presets.push({
      id: "entrance-lost",
      name: "To a door, then GPS lost",
      steps: [
        calm,
        {
          do: (gps) => {
            gps.setWalkSpeed(4);
            gps.walk([step, door.geometry.coordinates]);
          },
          thenWaitForWalk: true,
        },
        { do: (gps) => gps.setWalkSpeed(1.4), thenWaitMs: 1_500 },
        { do: (gps) => gps.setSignal(false) },
      ],
    });
  }

  return presets;
}

export function middleOf([west, south, east, north]: PublishedDataset["bounds"]): LngLat {
  return [(west + east) / 2, (south + north) / 2];
}

/** A point a little way in from the gate that really is inside. */
function insidePoint(boundary: Parameters<typeof containsPoint>[0], gate: LngLat, centre: LngLat): LngLat {
  const inwards = bearingDeg(gate, centre);
  for (const metres of [40, 60, 20, 100, 150]) {
    const point = destinationPoint(gate, inwards, metres);
    if (containsPoint(boundary, point)) return point;
  }
  return centre;
}

/** Halfway between the two closest doors of different buildings. */
function betweenTwoBuildings({ entrances }: PublishedDataset): LngLat | null {
  let best: { point: LngLat; gapM: number } | null = null;
  for (const a of entrances) {
    for (const b of entrances) {
      if (a.properties.buildingId >= b.properties.buildingId) continue;
      const [from, to] = [a.geometry.coordinates, b.geometry.coordinates];
      const gapM = distanceM(from, to);
      if (!best || gapM < best.gapM) best = { point: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], gapM };
    }
  }
  return best && best.gapM < 30 ? best.point : null;
}
