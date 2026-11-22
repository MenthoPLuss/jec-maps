import { describe, expect, it } from "vitest";

import { pathSchema } from "../../src/lib/data/schemas";
import { localPlane } from "../../src/lib/geo/localPlane";
import { polylineLengthM } from "../../src/lib/geo/polyline";
import { JEC_CENTRE, type LngLat } from "../../src/lib/geo/types";
import { importGpx, simplify } from "./gpxImport";

const plane = localPlane(JEC_CENTRE);
const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);

const gpxOf = (...tracks: LngLat[][]) => `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${tracks
  .map(
    (track) =>
      `<trk><trkseg>${track
        .map(([lng, lat]) => `<trkpt lat="${lat}" lon="${lng}"><ele>86</ele><time>2026-11-20T04:00:00Z</time></trkpt>`)
        .join("")}</trkseg></trk>`,
  )
  .join("")}</gpx>`;

describe("importGpx", () => {
  it("reads lat and lon attributes as [lng, lat] and drops altitude and time", () => {
    const { candidates, issues } = importGpx(gpxOf([at(0, 0), at(80, 0)]), "Main Road.gpx");

    expect(issues).toEqual([]);
    expect(candidates).toHaveLength(1);
    const [lng, lat] = candidates[0].geometry.coordinates[0];
    expect(lng).toBeCloseTo(94.25, 2);
    expect(lat).toBeCloseTo(26.746, 2);
    expect(candidates[0].geometry.coordinates[0]).toHaveLength(2);
    expect(JSON.stringify(candidates)).not.toContain("2026-11-20");
  });

  it("never makes something that could be routed over", () => {
    const { candidates } = importGpx(gpxOf([at(0, 0), at(80, 0)]), "walk.gpx");

    expect(candidates[0].properties).toMatchObject({ candidate: true, access: "unknown", reviewStatus: "unreviewed" });
    expect(pathSchema.safeParse(candidates[0]).success).toBe(false);
  });

  it("keeps several tracks apart, with stable ids", () => {
    const xml = gpxOf([at(0, 0), at(80, 0)], [at(0, 50), at(80, 50)]);

    expect(importGpx(xml, "walk.gpx").candidates.map((c) => c.properties.id)).toEqual(["gpx-walk-1", "gpx-walk-2"]);
    expect(importGpx(xml, "walk.gpx")).toEqual(importGpx(xml, "walk.gpx"));
  });

  it("leaves out tracks that go nowhere", () => {
    const { candidates, issues } = importGpx(gpxOf([at(0, 0), at(1, 0)]), "walk.gpx");

    expect(candidates).toEqual([]);
    expect(issues[0]).toMatchObject({ severity: "warning", record: "track 1" });
  });

  it("says so when there is no track", () => {
    expect(importGpx(gpxOf(), "empty.gpx").issues[0].message).toContain("no recorded track");
  });

  it.each(["", "hello", "<gpx><trk></gpx>", "<gpx", "{}"])("explains broken input %j", (xml) => {
    const { candidates, issues } = importGpx(xml, "broken.gpx");

    expect(candidates).toEqual([]);
    expect(issues[0]).toMatchObject({ file: "broken.gpx", record: "file" });
  });
});

describe("simplify", () => {
  it("removes GPS wiggle but keeps real corners", () => {
    const wiggly = [at(0, 0), at(20, 0.8), at(40, -0.9), at(60, 0.5), at(80, 0), at(80, 60)];
    const result = simplify(wiggly, 2);

    expect(result).toEqual([wiggly[0], wiggly[4], wiggly[5]]);
    expect(Math.abs(polylineLengthM(result) - 140)).toBeLessThan(1);
  });

  it("keeps both ends and never the same point twice", () => {
    expect(simplify([at(0, 0), at(0, 0)], 2)).toHaveLength(1);
    expect(simplify([at(0, 0), at(5, 0)], 2)).toHaveLength(2);
  });
});
