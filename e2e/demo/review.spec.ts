import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import { at, expect, reviewedCore, test, type LngLat } from "../support";

/** Where a position is on the screen of the review page. */
async function onReviewMap(page: Page, position: LngLat): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (spot) => (window as unknown as { __jecReview: { project(p: number[]): { x: number; y: number } } }).__jecReview.project(spot),
    position,
  );
}

function candidateFile(name: string, kind: string, features: object[]) {
  const text = JSON.stringify({ type: "FeatureCollection", candidates: true, kind, origin: "test", features });
  return { name, mimeType: "application/geo+json", buffer: Buffer.from(text) };
}

function path(id: string, fromNode: string, toNode: string, coordinates: LngLat[]) {
  return {
    type: "Feature",
    properties: { id, fromNode, toNode, kind: "footway", access: "unknown", direction: "both", layer: 0, source: "osm", placeholder: false, reviewStatus: "unreviewed" },
    geometry: { type: "LineString", coordinates },
  };
}

test.describe("the review page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/data/core.json", (route) => route.fulfill({ json: reviewedCore() }));
  });

  test("chooses paths in the list and on the map, and writes the command", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByTestId("approved-summary")).toContainText("the campus outline, 3 buildings");
    await expect(page.getByTestId("approved-summary")).toContainText("Real guidance is available");

    const gate = reviewedCore().paths.find((entry) => entry.properties.id === "demo-gate-road")!;
    const [lng, lat] = gate.geometry.coordinates[0];
    await page.getByTestId("file-input").setInputFiles([
      candidateFile("paths.candidates.geojson", "paths", [
        path("test-joined", gate.properties.fromNode, "test-n-1", [[lng, lat], [lng + 0.0003, lat]]),
        path("test-island", "test-n-2", "test-n-3", [at(-40, -220), at(40, -220)]),
      ]),
    ]);
    await expect(page.getByRole("heading", { name: "paths.candidates.geojson" })).toBeVisible();
    await expect(page.getByTestId("choice-summary")).toHaveText("Nothing chosen yet.");

    await page.getByRole("checkbox", { name: /test-joined/ }).check();
    await expect(page.getByTestId("choice-summary")).toHaveText(/^1 chosen, 30 m\.$/);
    await expect(page.getByTestId("approve-problem")).toContainText("Type your name");

    // The island, chosen with a click on the map.
    await page.waitForTimeout(1_000);
    const spot = await onReviewMap(page, at(0, -220));
    await page.mouse.click(spot.x, spot.y);
    await expect(page.getByRole("checkbox", { name: /test-island/ })).toBeChecked();
    await expect(page.getByTestId("choice-summary")).toContainText("2 chosen");
    await expect(page.getByTestId("choice-summary")).toContainText("1 of them not connected");

    await page.getByLabel(/Your name/).fill("Test Person");
    await expect(page.getByTestId("approve-problem")).toContainText("Choose who may walk");
    await page.getByRole("radio", { name: /^Public/ }).check();
    await expect(page.getByTestId("approve-command")).toHaveText(
      'npm run data:approve -- --file data-candidates/osm/paths.candidates.geojson --ids test-joined,test-island --access public --reviewer "Test Person"',
    );

    // The name is remembered on this computer.
    await page.reload();
    await expect(page.getByLabel(/Your name/)).toHaveValue("Test Person");
  });

  test("says which files it can't use", async ({ page }) => {
    await page.goto("/review");
    await page.getByTestId("file-input").setInputFiles([
      { name: "campus-paths.geojson", mimeType: "application/json", buffer: Buffer.from('{"type":"FeatureCollection","features":[]}') },
    ]);

    await expect(page.getByTestId("file-problems")).toContainText("campus-paths.geojson is not a candidate file");
  });

  test("places an entrance, writes its file, and knows when it is approved", async ({ page }) => {
    await page.goto("/review");
    await page.getByLabel(/Your name/).fill("Test Person");
    await page.getByRole("button", { name: "Place entrances" }).click();
    await page.waitForTimeout(1_000);

    // A little south of the south wall of Demo Block A, next to its main door.
    const spot = await onReviewMap(page, [94.2499, 26.7459882]);
    await page.mouse.click(spot.x, spot.y);
    const form = page.getByRole("form", { name: "New entrance" });
    await expect(form).toContainText("A door of Demo Block A");
    await expect(form.getByRole("button", { name: "Add entrance" })).toBeDisabled();

    await form.getByLabel(/Name/).fill("Side door");
    await form.getByLabel("Who may use it").selectOption("public");
    await expect(form.getByLabel(/path junction/)).toHaveValue(/^demo-n-/);
    await form.getByRole("button", { name: "Add entrance" }).click();

    const drafts = page.getByTestId("entrance-drafts");
    await expect(drafts).toContainText("demo-block-a-side-door");
    await expect(page.getByTestId("approve-command")).toHaveText(
      'npm run data:approve -- --file raw-data/candidates/entrances.candidates.geojson --ids demo-block-a-side-door --reviewer "Test Person"',
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download entrances.candidates.geojson" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("entrances.candidates.geojson");
    const file = JSON.parse(readFileSync(await download.path(), "utf8"));
    expect(file).toMatchObject({ candidates: true, kind: "entrances" });
    expect(file.features).toHaveLength(1);
    const [entrance] = file.features;
    expect(entrance.properties).toMatchObject({ id: "demo-block-a-side-door", buildingId: "demo-block-a", access: "public", level: 0 });
    expect(entrance.properties.outdoorNodeId).toMatch(/^demo-n-/);

    // The drafts stay on this computer until they are approved.
    await page.reload();
    await page.getByRole("button", { name: "Place entrances" }).click();
    await expect(drafts).toContainText("Side door");

    // Once approved and published, the page says so.
    const after = reviewedCore();
    after.entrances.push({ ...entrance, properties: { ...entrance.properties, reviewStatus: "reviewed" } });
    await page.unroute("**/data/core.json");
    await page.route("**/data/core.json", (route) => route.fulfill({ json: after }));
    await page.getByRole("button", { name: "Reload approved data" }).click();
    await expect(page.getByTestId("approved-summary")).toContainText("6 entrances");
    await expect(drafts).toContainText("Approved");
    await expect(page.getByTestId("approve-command")).toHaveCount(0);
  });
});
