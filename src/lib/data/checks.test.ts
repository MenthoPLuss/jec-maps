import { describe, expect, it } from "vitest";

import { localPlane } from "../geo/localPlane";
import { JEC_CENTRE } from "../geo/types";
import { demoFiles, problems, record, type Json } from "./testing";

const plane = localPlane(JEC_CENTRE);
const PLAN_0 = "buildings/demo-block-a/level-0.geojson";
const PLAN_1 = "buildings/demo-block-a/level-1.geojson";

function issuesWhen(breakIt: (files: Record<string, Json>) => void) {
  const files = demoFiles();
  breakIt(files);
  return problems(files);
}

describe("references", () => {
  it.each<[string, (files: Record<string, Json>) => void, object]>([
    [
      "a room in a building that does not exist",
      (files) => void (record(files, "rooms.json", "demo-b-101").buildingId = "demo-block-z"),
      { file: "rooms.json", record: "demo-b-101", field: "buildingId" },
    ],
    [
      "a room on a floor that does not exist",
      (files) => void (record(files, "rooms.json", "demo-b-101").level = 9),
      { file: "rooms.json", record: "demo-b-101", field: "level" },
    ],
    [
      "a room with someone else's door",
      (files) => void (record(files, "rooms.json", "demo-a-001").doorId = "demo-door-a-002"),
      { file: "rooms.json", record: "demo-a-001", field: "doorId" },
    ],
    [
      "a room with a door that does not exist",
      (files) => void (record(files, "rooms.json", "demo-a-001").doorId = "demo-door-x"),
      { file: "rooms.json", record: "demo-a-001", field: "doorId" },
    ],
    [
      "an entrance of a missing building",
      (files) => void (record(files, "entrances.geojson", "demo-library-west").buildingId = "demo-block-z"),
      { file: "entrances.geojson", record: "demo-library-west", field: "buildingId" },
    ],
    [
      "an entrance at a missing junction",
      (files) => void (record(files, "entrances.geojson", "demo-library-west").outdoorNodeId = "demo-n-nowhere"),
      { file: "entrances.geojson", record: "demo-library-west", field: "outdoorNodeId" },
    ],
    [
      "an entrance at a missing corridor junction",
      (files) => void (record(files, "entrances.geojson", "demo-block-a-main").indoorNodeId = "demo-a0-nowhere"),
      { file: "entrances.geojson", record: "demo-block-a-main", field: "indoorNodeId" },
    ],
    [
      "a building that lists a missing entrance",
      (files) => void record(files, "buildings.geojson", "demo-library").entranceIds.push("demo-library-back"),
      { file: "buildings.geojson", record: "demo-library", field: "entranceIds" },
    ],
    [
      "a building that forgets its entrance",
      (files) => void (record(files, "buildings.geojson", "demo-library").entranceIds = []),
      { file: "entrances.geojson", record: "demo-library-west", field: "buildingId" },
    ],
    [
      "a place in a missing building",
      (files) => void (record(files, "places.geojson", "demo-reading-hall").buildingId = "demo-block-z"),
      { file: "places.geojson", record: "demo-reading-hall", field: "buildingId" },
    ],
    [
      "a door of a missing room",
      (files) => void (record(files, PLAN_0, "demo-door-a-001").roomId = "demo-a-999"),
      { file: PLAN_0, record: "demo-a-999", field: "roomId" },
    ],
    [
      "a door at a missing junction",
      (files) => void (record(files, PLAN_0, "demo-door-a-001").nodeId = "demo-a0-nowhere"),
      { file: PLAN_0, record: "demo-door-a-001", field: "nodeId" },
    ],
    [
      "stairs to a floor without a plan",
      (files) => void (record(files, PLAN_0, "demo-a0-stairs").connects = [{ level: 5, nodeId: "demo-a5-stairs" }]),
      { file: PLAN_0, record: "demo-a0-stairs", field: "connects" },
    ],
    [
      "stairs that arrive at the wrong junction",
      (files) => void (record(files, PLAN_0, "demo-a0-stairs").connects[0].nodeId = "demo-a1-lift"),
      { file: PLAN_0, record: "demo-a0-stairs", field: "connects" },
    ],
    [
      "a lift that turns into stairs",
      (files) => void (record(files, PLAN_1, "demo-a1-lift").kind = "stairs"),
      { file: PLAN_0, record: "demo-a0-lift", field: "kind" },
    ],
    [
      "a junction used on two floors",
      (files) => {
        for (const { properties } of files[PLAN_1].features) {
          for (const key of ["fromNode", "toNode", "nodeId"]) {
            if (properties[key] === "demo-a1-e") properties[key] = "demo-a0-e";
          }
        }
      },
      { file: PLAN_1, record: "demo-a0-e" },
    ],
  ])("reports %s", (_name, breakIt, expected) => {
    expect(issuesWhen(breakIt)).toContainEqual(expect.objectContaining({ severity: "error", ...expected }));
  });
});

describe("duplicates and conflicts", () => {
  it("the same id twice", () => {
    const issues = issuesWhen((files) => {
      record(files, "places.geojson", "demo-atm").id = "demo-canteen";
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "error", file: "places.geojson", record: "demo-canteen", field: "id" }),
    );
  });

  it("the same room number twice in one building", () => {
    const issues = issuesWhen((files) => {
      record(files, "rooms.json", "demo-b-102a").roomNumber = "101";
    });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "error", record: "demo-block-b 101" }));
  });

  it("allows the same number in two buildings, and rooms without a number", () => {
    const issues = issuesWhen((files) => {
      record(files, "rooms.json", "demo-l-01").roomNumber = "101";
    });
    expect(issues).toEqual([]);
  });

  it("keeps leading zeros and letters apart", () => {
    const issues = issuesWhen((files) => {
      record(files, "rooms.json", "demo-b-002").roomNumber = "1";
    });
    expect(issues).toEqual([]); // "001" and "1" are different plates
  });
});

describe("geometry", () => {
  it("a place on the other side of the world", () => {
    const issues = issuesWhen((files) => {
      files["places.geojson"].features[0].geometry.coordinates = [26.7458, 84.2506];
    });
    expect(issues[0]).toMatchObject({ file: "places.geojson", record: "demo-main-gate", field: "geometry.coordinates" });
    expect(issues[0].message).toContain("swapped");
  });

  it("a path without length", () => {
    const issues = issuesWhen((files) => {
      const path = files["campus-paths.geojson"].features[0];
      path.geometry.coordinates[1] = path.geometry.coordinates[0];
      path.properties.toNode = "demo-n-elsewhere";
    });
    expect(issues).toContainEqual(expect.objectContaining({ record: "demo-gate-road", message: "the path has no length" }));
  });

  it("a junction that two paths put in different spots", () => {
    const issues = issuesWhen((files) => {
      const path = files["campus-paths.geojson"].features[0];
      path.geometry.coordinates[1] = plane.toLngLat([6, -150]);
    });
    expect(issues.some((issue) => issue.severity === "error" && issue.message.includes("demo-n-gate-square"))).toBe(true);
  });

  it("an outline that crosses itself", () => {
    const issues = issuesWhen((files) => {
      const ring = files["buildings.geojson"].features[0].geometry.coordinates[0];
      [ring[1], ring[2]] = [ring[2], ring[1]];
    });
    expect(issues).toContainEqual(expect.objectContaining({ record: "demo-block-a", message: "the outline crosses itself" }));
  });

  it("a building outside the campus is only a warning", () => {
    const issues = issuesWhen((files) => {
      const { geometry } = files["buildings.geojson"].features[2];
      geometry.coordinates[0] = geometry.coordinates[0].map(([lng, lat]: number[]) => [lng + 0.01, lat]);
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "warning", record: "demo-library", message: "lies outside the campus boundary" }),
    );
  });
});

describe("topology", () => {
  const crossing = (files: Record<string, Json>, layer: number) => {
    const paths = files["campus-paths.geojson"].features;
    const extra = structuredClone(paths[0]);
    Object.assign(extra.properties, {
      id: "demo-crossing",
      fromNode: "demo-n-cross-a",
      toNode: "demo-n-cross-b",
      layer,
    });
    extra.geometry.coordinates = [plane.toLngLat([-30, -50]), plane.toLngLat([30, -50])];
    paths.push(extra);
  };

  it("warns about a crossing without a shared junction", () => {
    const issues = issuesWhen((files) => crossing(files, 0));
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "warning", record: "demo-central-avenue", message: expect.stringContaining("demo-crossing") }),
    );
  });

  it("accepts a bridge that crosses above", () => {
    expect(issuesWhen((files) => crossing(files, 1))).toEqual([]);
  });

  it("warns when a path stops just short of another", () => {
    const issues = issuesWhen((files) => {
      const paths = files["campus-paths.geojson"].features;
      const extra = structuredClone(paths[0]);
      Object.assign(extra.properties, { id: "demo-short", fromNode: "demo-n-s1", toNode: "demo-n-s2" });
      extra.geometry.coordinates = [plane.toLngLat([-30, -50]), plane.toLngLat([-1, -50])];
      paths.push(extra);
    });
    expect(issues).toContainEqual(expect.objectContaining({ record: "demo-short", message: expect.stringContaining("1.0 m") }));
  });
});

describe("demo and live data stay apart", () => {
  it("refuses a real record in the demo", () => {
    const issues = issuesWhen((files) => {
      Object.assign(record(files, "places.geojson", "demo-atm"), { placeholder: false, reviewStatus: "reviewed" });
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "error", record: "demo-atm", field: "placeholder" }),
    );
  });
});
