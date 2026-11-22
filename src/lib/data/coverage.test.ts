import { describe, expect, it } from "vitest";

import { coverageOf } from "./coverage";
import { demoFiles, mustParse, published, record, reviewedFiles, type Json } from "./testing";

function liveCoverage(change: (files: Record<string, Json>) => void = () => {}) {
  const files = reviewedFiles();
  change(files);
  return coverageOf(mustParse(files));
}

describe("real guidance", () => {
  it("is never available with the demo", () => {
    const coverage = coverageOf(mustParse(demoFiles()));

    expect(coverage.live).toEqual({ available: false, reasons: ["The campus data is a made-up demo."] });
    expect(coverage.routablePathIds).not.toHaveLength(0); // still usable with the fake GPS
  });

  it("is available with reviewed data", () => {
    expect(liveCoverage().live).toEqual({ available: true, reasons: [] });
  });

  it("needs a boundary", () => {
    const { live } = liveCoverage((files) => void (files["campus-boundary.geojson"].features = []));
    expect(live).toEqual({ available: false, reasons: ["There is no campus boundary yet."] });
  });

  it("needs a reviewed boundary", () => {
    const { live } = liveCoverage((files) => {
      record(files, "campus-boundary.geojson", "demo-campus").reviewStatus = "unreviewed";
    });
    expect(live.reasons).toEqual(["The campus boundary has not been reviewed yet."]);
  });

  it("does not accept a placeholder boundary, whatever its review status", () => {
    const { live } = liveCoverage((files) => {
      Object.assign(record(files, "campus-boundary.geojson", "demo-campus"), {
        placeholder: true,
        reviewStatus: "unreviewed",
      });
    });
    expect(live.available).toBe(false);
  });

  it("needs reviewed paths", () => {
    const { live } = liveCoverage((files) => {
      for (const { properties } of files["campus-paths.geojson"].features) properties.reviewStatus = "unreviewed";
    });
    expect(live.reasons).toEqual(["There are no reviewed walking paths yet."]);
  });
});

describe("which paths routes may use", () => {
  it("leaves out restricted paths", () => {
    expect(liveCoverage().routablePathIds).not.toContain("demo-service-road");
  });

  it.each([
    ["unreviewed", { reviewStatus: "unreviewed" }],
    ["placeholder", { reviewStatus: "unreviewed", placeholder: true }],
    ["unknown access", { access: "unknown" }],
  ])("leaves out a path that is %s, and says so", (_name, change) => {
    const { routablePathIds, issues } = liveCoverage((files) => {
      Object.assign(record(files, "campus-paths.geojson", "demo-parking-steps"), change);
    });

    expect(routablePathIds).not.toContain("demo-parking-steps");
    expect(issues).toContainEqual(expect.objectContaining({ severity: "warning", record: "demo-parking-steps" }));
  });

  it("leaves out paths that are cut off from the main network, and says so", () => {
    const { routablePathIds, issues, live } = liveCoverage((files) => {
      // Cut the hostel off on both sides.
      for (const id of ["demo-hostel-walk", "demo-hostel-loop"]) {
        record(files, "campus-paths.geojson", id).access = "private";
      }
      const extra = structuredClone(files["campus-paths.geojson"].features[0]);
      Object.assign(extra.properties, { id: "demo-island", fromNode: "demo-n-i1", toNode: "demo-n-i2" });
      extra.geometry.coordinates = [
        [94.2517, 26.745],
        [94.2519, 26.745],
      ];
      files["campus-paths.geojson"].features.push(extra);
    });

    expect(routablePathIds).not.toContain("demo-island");
    expect(issues).toContainEqual(
      expect.objectContaining({ record: "demo-island", message: expect.stringContaining("not connected") }),
    );
    expect(live.available).toBe(true); // the rest still works
  });
});

describe("what the app downloads", () => {
  it("frames the campus", () => {
    const [west, south, east, north] = published().core.bounds;
    expect(west).toBeLessThan(94.2506399);
    expect(east).toBeGreaterThan(94.2506399);
    expect(south).toBeLessThan(26.7458283);
    expect(north).toBeGreaterThan(26.7458283);
  });

  it("keeps the floor plans out of the main file", () => {
    const { core, indoor } = published();

    expect(core.indoorLevels).toEqual({ "demo-block-a": [0, 1] });
    expect(JSON.stringify(core).includes("featureType")).toBe(false);
    expect(indoor).toHaveLength(1);
    expect(indoor[0].levels.map((plan) => plan.level)).toEqual([0, 1]);
  });

  it("drops rejected records and everything that hangs on them", () => {
    const files = demoFiles();
    record(files, "buildings.geojson", "demo-block-b").reviewStatus = "rejected";
    record(files, "places.geojson", "demo-atm").reviewStatus = "rejected";
    const { core } = published(files);

    expect(core.buildings.map((building) => building.properties.id)).not.toContain("demo-block-b");
    expect(core.rooms.some((room) => room.buildingId === "demo-block-b")).toBe(false);
    expect(core.entrances.some((entrance) => entrance.properties.buildingId === "demo-block-b")).toBe(false);
    expect(core.places.map((place) => place.properties.id)).not.toContain("demo-atm");
  });

  it("marks a demo boundary as not trusted", () => {
    expect(published().core.boundaryTrusted).toBe(false);
    expect(published(reviewedFiles()).core.boundaryTrusted).toBe(true);
  });
});
