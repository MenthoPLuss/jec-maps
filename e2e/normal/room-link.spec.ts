import { at, expect, reviewedCore, test } from "../support";

const link = "/room/demo-block-a/demo-a-102";

test("a shared room opens, also directly and after a reload", async ({ page }) => {
  await page.goto(link);
  await expect(page).toHaveTitle("A-102 Demo Drawing Hall · JEC Maps");
  const card = page.getByTestId("room-card");
  await expect(card).toContainText("Floor 1");
  await expect(card).toContainText("Demo Block A");

  await page.reload();
  await expect(card).toContainText("A-102 Demo Drawing Hall");
  // It is a destination, never a position.
  await expect(card).not.toContainText("You said you are here");
  await expect(page.getByTestId("user-dot")).toHaveCount(0);
});

test.describe("far away from campus", () => {
  test.use({ geolocation: { longitude: at(0, 0)[0], latitude: 26.7, accuracy: 8 }, permissions: ["geolocation"] });

  test("the room card is still there to read", async ({ page }) => {
    await page.route("**/data/core.json", (route) => route.fulfill({ json: reviewedCore() }));
    await page.goto(link);
    await expect(page.getByTestId("shared-room")).toContainText("Floor 1");

    await page.getByRole("button", { name: "Enable location" }).click();
    await expect(page.getByTestId("locked-screen")).toContainText("km");
    await expect(page.getByTestId("shared-room")).toContainText("A-102");
    await expect(page.getByRole("button", { name: "I'm in this room" })).toHaveCount(0);
  });
});

test.describe("links that lead nowhere", () => {
  test.use({ allowedErrors: [/404/] });

  for (const [name, path] of [
    ["an unknown room", "/room/demo-block-a/demo-a-999"],
    ["an unknown building", "/room/nowhere/demo-a-102"],
    ["a room of another building", "/room/demo-block-b/demo-a-102"],
    ["something strange", "/room/demo-block-a/..%2Fsecret"],
  ]) {
    test(`${name} gets a helpful page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("does not exist");
      await expect(page.getByRole("link", { name: /Back to the map/ })).toBeVisible();
    });
  }
});

test("without JavaScript the facts are there", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}${link}`);
  await expect(page.getByText("A-102 Demo Drawing Hall").first()).toBeVisible();
  await expect(page.getByText("Floor 1").first()).toBeVisible();
  await context.close();
});
