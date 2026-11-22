import { expect, expectMapDrawn, test } from "../support";

const map = "canvas.maplibregl-canvas";

test("shows the demo campus without asking any other site", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("JEC Maps");
  await expectMapDrawn(page);
  await expect(page.getByTestId("demo-badge")).toContainText("Demo data");
  await expect(page.getByText("Unofficial student project, not affiliated with Jorhat Engineering College")).toBeVisible();
  // The guard in support.ts fails this test on any request to another site.
});

test("finds a place", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search the campus" }).fill("canteen");
  await page.getByRole("option", { name: /Demo Canteen/ }).click();

  await expect(page.getByTestId("selection")).toContainText("Demo Canteen");
});

test.describe("when the campus data can't be downloaded", () => {
  test.use({ allowedErrors: [/ERR_FAILED/] });

  test("explains it and tries again", async ({ page }) => {
    await page.route("**/data/core.json", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByTestId("dataset-error")).toContainText("internet connection");

    await page.unroute("**/data/core.json");
    await page.getByRole("button", { name: "Try again" }).click();
    await expectMapDrawn(page);
  });
});

test("says so when the device has no WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith("webgl") ? null : original.call(this, type as "2d", ...(rest as []));
    } as typeof original;
  });
  await page.goto("/");

  await expect(page.getByTestId("no-webgl")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search the campus" })).toBeVisible();
});

test("information pages open and lead back", async ({ page }) => {
  await page.goto("/");
  for (const name of ["About", "Privacy", "Help"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Unofficial student project").first()).toBeVisible();
    await page.getByRole("link", { name: /Back to the map/ }).click();
    await expectMapDrawn(page);
  }
});

test("?mock=1 and ?edit=1 do nothing in a normal build", async ({ page }) => {
  await page.goto("/?mock=1&edit=1");
  await expect(page.locator(map)).toBeVisible();

  await expect(page.getByRole("region", { name: "Place editor" })).toHaveCount(0);
  await expect(page.getByText("MOCK GPS")).toHaveCount(0);
});

test.describe("in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("draws the map too", async ({ page }) => {
    await page.goto("/");
    await expectMapDrawn(page);
  });
});

test("keeps drawing when the colour scheme changes", async ({ page }) => {
  await page.goto("/");
  await expectMapDrawn(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectMapDrawn(page);
});

test("comes back after the graphics card was reset", async ({ page }) => {
  await page.goto("/");
  await expectMapDrawn(page);

  // Broken until the test says otherwise, so the notice can't be missed.
  const card = await page.evaluateHandle(() => {
    const canvas = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement;
    return canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context");
  });
  await card.evaluate((extension) => extension?.loseContext());
  await expect(page.getByText("The graphics were reset")).toBeVisible();
  await card.evaluate((extension) => extension?.restoreContext());
  await expect(page.getByText("The graphics were reset")).toBeHidden();
  await expectMapDrawn(page);
});

test("the image optimizer endpoint is switched off", async ({ request }) => {
  const response = await request.get("/_next/image?url=%2Ffavicon.ico&w=64&q=75");

  expect(response.status()).toBe(404);
});
