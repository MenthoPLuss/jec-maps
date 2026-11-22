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

test.describe("when a part of the map engine can't be downloaded", () => {
  test.use({ allowedErrors: [/ERR_FAILED|Worker failed to load/] });

  test("says so, and the rest works", async ({ page }) => {
    await page.route("**/maplibre/**", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByTestId("no-worker")).toContainText("could not be downloaded");
    await page.getByRole("combobox", { name: "Search the campus" }).fill("canteen");
    await page.getByRole("option", { name: /Demo Canteen/ }).click();
    await expect(page.getByTestId("selection")).toBeVisible();

    await page.unroute("**/maplibre/**");
    await page.getByRole("button", { name: "Reload the page" }).click();
    await expectMapDrawn(page);
  });
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

test("can be added to the home screen", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "JEC Maps", display: "standalone" });
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test("the page has something to read before any script runs", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL as string);
  await expect(page.getByRole("heading", { name: "JEC Maps" })).toBeVisible();
  await expect(page.getByText("Unofficial student project")).toBeVisible();
  await context.close();
});

test("everything that can be pressed is big enough and has a name", async ({ page }) => {
  await page.goto("/");
  await expectMapDrawn(page);

  for (const element of await page.locator("button:visible, a:visible, input:visible").all()) {
    const box = (await element.boundingBox())!;
    const name = await element.evaluate((node) => node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "");
    expect(name, await element.evaluate((node) => node.outerHTML.slice(0, 80))).not.toBe("");
    // WCAG 2.2 asks for 24 px. The attribution toggle belongs to MapLibre.
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(24);
  }
});

for (const width of [360, 430]) {
  test(`nothing overflows at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    for (const path of ["/", "/about", "/privacy", "/help", "/room/demo-block-a/demo-a-102"]) {
      await page.goto(path);
      await expect(page.getByText("Unofficial student project").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
}
