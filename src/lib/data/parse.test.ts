import { describe, expect, it } from "vitest";

import { parseDataset } from "./parse";
import { demoFiles, problems, record, type Json } from "./testing";

describe("a valid dataset", () => {
  it("has no problems at all", () => {
    expect(problems(demoFiles())).toEqual([]);
  });

  it("keeps positions as [longitude, latitude]", () => {
    const { dataset } = parseDataset(demoFiles());
    const [lng, lat] = dataset!.places[0].geometry.coordinates;

    expect(lng).toBeCloseTo(94.25, 1);
    expect(lat).toBeCloseTo(26.74, 1);
  });
});

/** Breaks the demo in one way and returns the first problem. */
function firstProblem(breakIt: (files: Record<string, Json>) => void) {
  const files = demoFiles();
  breakIt(files);
  const found = problems(files);
  return found[0];
}

describe("broken records name the file, the record and the field", () => {
  it("swapped coordinates", () => {
    const issue = firstProblem((files) => {
      const gate = files["places.geojson"].features[0];
      gate.geometry.coordinates.reverse();
    });

    expect(issue).toMatchObject({ severity: "error", file: "places.geojson", record: "demo-main-gate" });
    expect(issue.field).toBe("geometry.coordinates.1");
    expect(issue.message).toContain("swapped");
  });

  it("a ring that is not closed", () => {
    const issue = firstProblem((files) => {
      files["buildings.geojson"].features[0].geometry.coordinates[0].pop();
    });

    expect(issue).toMatchObject({ file: "buildings.geojson", record: "demo-block-a", field: "geometry.coordinates.0" });
    expect(issue.message).toContain("not closed");
  });

  it("text where a number belongs", () => {
    const issue = firstProblem((files) => {
      record(files, "rooms.json", "demo-a-101").level = "1";
    });

    expect(issue).toMatchObject({ file: "rooms.json", record: "demo-a-101", field: "level" });
  });

  it("a room number that lost its text form", () => {
    const issue = firstProblem((files) => {
      record(files, "rooms.json", "demo-b-001").roomNumber = 1;
    });

    expect(issue).toMatchObject({ file: "rooms.json", record: "demo-b-001", field: "roomNumber" });
  });

  it("a misspelt field", () => {
    const issue = firstProblem((files) => {
      record(files, "buildings.geojson", "demo-block-a").levls = [];
    });

    expect(issue).toMatchObject({ file: "buildings.geojson", record: "demo-block-a" });
    expect(issue.message).toContain("levls");
  });

  it("an id that is not kebab-case", () => {
    const issue = firstProblem((files) => {
      record(files, "places.geojson", "demo-atm").id = "Demo ATM";
    });

    expect(issue).toMatchObject({ file: "places.geojson", record: "Demo ATM", field: "properties.id" });
  });

  it("a record without an id, by its position", () => {
    const issue = firstProblem((files) => {
      delete record(files, "places.geojson", "demo-canteen").id;
    });

    expect(issue).toMatchObject({ file: "places.geojson", record: "record 3", field: "properties.id" });
  });

  it("an unknown kind of floor-plan feature", () => {
    const issue = firstProblem((files) => {
      files["buildings/demo-block-a/level-0.geojson"].features[0].properties.featureType = "window";
    });

    expect(issue.file).toBe("buildings/demo-block-a/level-0.geojson");
    expect(issue.field).toBe("properties.featureType");
    expect(issue.message).toContain("corridor");
  });

  it("NaN and infinity", () => {
    for (const bad of [NaN, Infinity]) {
      const issue = firstProblem((files) => {
        files["places.geojson"].features[0].geometry.coordinates[0] = bad;
      });
      expect(issue).toMatchObject({ record: "demo-main-gate", field: "geometry.coordinates.0" });
    }
  });

  it("a placeholder that claims to be reviewed", () => {
    const issue = firstProblem((files) => {
      record(files, "campus-paths.geojson", "demo-gate-road").reviewStatus = "reviewed";
    });

    expect(issue).toMatchObject({ record: "demo-gate-road", field: "properties.reviewStatus" });
  });

  it("a measured accuracy without evidence", () => {
    const issue = firstProblem((files) => {
      record(files, "buildings.geojson", "demo-block-a").accuracy = { status: "estimated", metres: 4 };
    });

    expect(issue).toMatchObject({ record: "demo-block-a", field: "properties.accuracy.metres" });
  });

  it("reports every broken record, not only the first", () => {
    const files = demoFiles();
    for (const id of ["demo-atm", "demo-canteen", "demo-hostel"]) record(files, "places.geojson", id).category = "shop";

    expect(problems(files).map((issue) => issue.record).sort()).toEqual(["demo-atm", "demo-canteen", "demo-hostel"]);
  });
});

describe("broken files", () => {
  it("a missing file", () => {
    const issue = firstProblem((files) => {
      delete files["rooms.json"];
    });
    expect(issue).toMatchObject({ file: "rooms.json", message: "the file is missing" });
  });

  it("a missing manifest", () => {
    const issue = firstProblem((files) => {
      delete files["dataset-manifest.json"];
    });
    expect(issue.file).toBe("dataset-manifest.json");
  });

  it("a manifest path that leaves the folder", () => {
    const issue = firstProblem((files) => {
      files["dataset-manifest.json"].files.rooms = "../../secret.json";
    });
    expect(issue).toMatchObject({ file: "dataset-manifest.json", field: "files.rooms" });
  });

  it("something that is not a FeatureCollection", () => {
    const issue = firstProblem((files) => {
      files["places.geojson"] = { type: "Feature" };
    });
    expect(issue).toMatchObject({ file: "places.geojson", record: "file", field: "type" });
  });

  it("two boundaries", () => {
    const issue = firstProblem((files) => {
      const { features } = files["campus-boundary.geojson"];
      features.push(structuredClone(features[0]));
    });
    expect(issue.message).toContain("only one campus boundary");
  });

  it("never returns half a dataset", () => {
    const files = demoFiles();
    record(files, "places.geojson", "demo-atm").category = "shop";
    expect(parseDataset(files).dataset).toBeNull();
  });
});
