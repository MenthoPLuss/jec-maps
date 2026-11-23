import { describe, expect, it } from "vitest";

import { problems, published, record, reviewedFiles } from "../data/testing";
import { destinationPoint, distanceM } from "../geo/distance";
import type { LngLat } from "../geo/types";
import { parseCandidates } from "./candidates";
import {
  JUNCTION_REACH_M,
  doorSpot,
  entranceFeature,
  entranceIdFor,
  entrancesFileText,
  isEntranceDraft,
  junctionsNear,
  type EntranceDraft,
} from "./entrances";

const { core } = published(reviewedFiles());
const mainDoor: LngLat = [94.2498342, 26.7460082]; // demo-block-a-main, on the south wall

describe("doorSpot", () => {
  it("puts the door on the nearest wall", () => {
    const spot = doorSpot(core.buildings, destinationPoint(mainDoor, 180, 4));

    expect(spot?.buildingId).toBe("demo-block-a");
    expect(distanceM(spot!.position, mainDoor)).toBeLessThan(0.5);
  });

  it("is no door far from every building", () => {
    expect(doorSpot(core.buildings, destinationPoint(mainDoor, 180, 40))).toBeNull();
  });
});

describe("junctionsNear", () => {
  it("offers the junctions of the paths, the closest first", () => {
    const junctions = junctionsNear(core.paths, mainDoor);

    expect(junctions[0].nodeId).toBe("demo-n-block-a-main");
    expect(new Set(junctions.map((junction) => junction.nodeId)).size).toBe(junctions.length);
    expect(junctions.every((junction) => junction.distanceM <= JUNCTION_REACH_M)).toBe(true);
    expect(junctions.map((junction) => junction.distanceM)).toEqual([...junctions.map((junction) => junction.distanceM)].sort((a, b) => a - b));
  });
});

describe("entranceIdFor", () => {
  it("names the entrance after its building, never twice the same", () => {
    expect(entranceIdFor("jec-library", "Front door", new Set())).toBe("jec-library-front-door");
    expect(entranceIdFor("jec-library", "JEC Library side", new Set())).toBe("jec-library-side");
    expect(entranceIdFor("jec-library", "Front door", new Set(["jec-library-front-door"]))).toBe("jec-library-front-door-2");
    expect(entranceIdFor("jec-library", "!!", new Set())).toBe("");
  });
});

describe("the entrances file", () => {
  const draft: EntranceDraft = {
    id: "demo-library-south",
    buildingId: "demo-library",
    name: "South door",
    level: 0,
    access: "public",
    outdoorNodeId: junctionsNear(core.paths, mainDoor)[0].nodeId,
    position: [94.2518, 26.7460441],
  };

  it("is a candidate file of entrances", () => {
    const file = parseCandidates(entrancesFileText([draft, { ...draft, id: "demo-library-south-2" }]), "x");

    expect(file.kind).toBe("entrances");
    expect(file.records).toEqual([entranceFeature(draft), entranceFeature({ ...draft, id: "demo-library-south-2" })]);
    expect(parseCandidates(entrancesFileText([]), "x").records).toEqual([]);
  });

  it("holds records that pass every check once approved", () => {
    const files = reviewedFiles();
    const entrance = entranceFeature(draft);
    Object.assign(entrance.properties, { reviewStatus: "reviewed", reviewedBy: "Test", reviewedOn: "2026-11-23" });
    files["entrances.geojson"].features.push(entrance);
    record(files, "buildings.geojson", "demo-library").entranceIds.push(draft.id);

    // The junction belongs to another building's door, so only a distance warning is allowed.
    expect(problems(files).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("keeps only sound drafts in the browser", () => {
    expect(isEntranceDraft(draft)).toBe(true);
    expect(isEntranceDraft({ ...draft, id: "Not An Id" })).toBe(false);
    expect(isEntranceDraft({ ...draft, access: "maybe" })).toBe(false);
    expect(isEntranceDraft({ ...draft, position: [26.7, 94.2] })).toBe(false);
    expect(isEntranceDraft({ ...draft, level: 0.5 })).toBe(false);
    expect(isEntranceDraft(null)).toBe(false);
  });
});
