import path from "node:path";

import { MockGps, expect, test } from "../support";

/** npm run screenshots: one picture per state, always from the made-up campus. */
test.skip(!process.env.SCREENSHOTS, "only on request: it overwrites docs/screenshots");

test.use({ deviceScaleFactor: 1 });

test("docs/screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  const gps = new MockGps(page);
  const shot = async (name: string) => {
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: path.join("docs", "screenshots", `${name}.png`) });
  };

  await gps.open();
  await page.waitForTimeout(2_000);
  await shot("01-permission");

  await gps.preset("Far outside (2.3 km)");
  await page.getByRole("button", { name: "Enable location" }).click();
  await expect(page.getByTestId("locked-screen")).toContainText("2.3 km");
  await shot("02-locked");

  await gps.preset("Standing on campus");
  await expect(page.getByTestId("user-dot")).toBeVisible();
  await shot("03-unlocked");

  await page.getByRole("combobox", { name: "Search the campus" }).fill("a10");
  await expect(page.getByRole("option").first()).toBeVisible();
  await shot("04-search");
  await page.getByRole("combobox", { name: "Search the campus" }).fill("");

  await gps.search("canteen", /Demo Canteen/);
  await expect(gps.status("active")).toBeVisible();
  await shot("05-route");

  await gps.slide("Speed", 8);
  await gps.preset("Walk the route");
  await expect(page.getByTestId("arrived")).toBeVisible({ timeout: 60_000 });
  await shot("06-arrived");

  await gps.search("A-102", /A-102/);
  await expect(gps.status("active")).toBeVisible();
  await gps.preset("To a door, then GPS lost");
  await expect(page.getByTestId("suggestion")).toBeVisible({ timeout: 40_000 });
  await shot("07-building-question");

  await page.getByRole("button", { name: "Yes, I'm inside" }).click();
  await expect(page.getByTestId("building-bar")).toBeVisible();
  await shot("08-building");

  await page.getByRole("button", { name: "Show more" }).click();
  await shot("09-steps");
  await page.getByRole("button", { name: "Show everything" }).click();
  await page.getByRole("button", { name: "Show less" }).click();

  await page.getByTestId("floor-switcher").getByRole("button", { name: "Floor 1" }).click();
  await shot("10-floor-1");

  await page.getByRole("button", { name: "I've reached the room" }).click();
  await expect(page.getByTestId("arrived")).toBeVisible();
  await shot("11-in-the-room");

  await page.goto("/room/demo-block-a/demo-a-102");
  await expect(page.getByTestId("room-card")).toBeVisible();
  await page.waitForTimeout(2_000);
  await shot("12-shared-room");
});
