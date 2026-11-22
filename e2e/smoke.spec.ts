import { expect, test } from "@playwright/test";

test("the home page shows the map", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/JEC Map/);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
});

test("the image optimizer endpoint is switched off", async ({ request }) => {
  const response = await request.get("/_next/image?url=%2Ffavicon.ico&w=64&q=75");

  expect(response.status()).toBe(404);
});
