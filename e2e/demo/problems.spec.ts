import { MockGps, at, expect, onScreen, test } from "../support";

test("every location problem has its own screen and a way on", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.open();
  await page.getByRole("button", { name: "Enable location" }).click();

  for (const [problem, title] of [
    ["denied", "Location is blocked"],
    ["insecure", "This address is not secure"],
    ["unsupported", "This browser has no location"],
  ]) {
    await gps.preset(`Error: ${problem}`);
    await expect(page.getByTestId(`problem-${problem}`)).toContainText(title);
    if (problem === "denied") {
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.getByTestId("problem-denied")).toHaveCount(0);
    }
  }
});

test("a passing problem on campus does not lock the map", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.panel((panel) => panel.getByRole("button", { name: "Signal: on" }).click());
  await gps.preset("Error: timeout");

  await expect(page.getByText("The GPS has a problem right now")).toBeVisible();
  await expect(page.getByTestId("user-dot")).toBeVisible();
});

test("a very rough signal is never turned into a claim", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.open();
  await gps.slide("Accuracy", 120);
  await page.getByRole("button", { name: "Enable location" }).click();

  await expect(page.getByTestId("finding-screen")).toContainText("too rough");
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("quality")).toHaveCount(0); // still not unlocked
});

test("a lost signal freezes the route and says so", async ({ page }) => {
  test.setTimeout(90_000);
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("hostel", /Demo Hostel/);
  const distance = page.getByTestId("distance");
  await expect(distance).toBeVisible();

  await gps.preset("Signal lost here");
  const before = await distance.innerText();
  await expect(page.getByTestId("quality")).toContainText("GPS lost", { timeout: 25_000 });
  await expect(page.getByText("Position lost")).toBeVisible();
  expect(await distance.innerText()).toBe(before);
  await expect(page.getByTestId("locked-screen")).toHaveCount(0);
});

test("a rough signal near the destination says near, not arrived", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("medical", /Demo Medical Room/);
  await expect(gps.status("active")).toBeVisible();
  await gps.slide("Accuracy", 45);

  await gps.panel((panel) => panel.getByRole("radio", { name: "moves the fake user" }).check());
  const { x, y } = await onScreen(page, at(-1, -118));
  await page.mouse.click(x, y);
  await expect(page.getByTestId("near")).toBeVisible();
  await page.waitForTimeout(6_000);
  await expect(page.getByTestId("arrived")).toHaveCount(0);

  await page.getByRole("button", { name: "I'm here" }).click();
  await expect(page.getByTestId("arrived")).toBeVisible();
});

test("without a checked path there is a straight line, and it looks different", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  // 50 m from any path.
  const { x, y } = await onScreen(page, at(-50, -150));
  await page.mouse.click(x, y);

  await expect(gps.status("no-route")).toContainText("Route unavailable");
  await expect(page.getByTestId("straight-line")).toContainText("This is not a walking route");
  await expect(page.getByTestId("distance")).toHaveCount(0);
  await expect(page.getByTestId("eta")).toHaveCount(0);
});

test("avoid stairs changes the route and promises nothing", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.preset("Between two buildings");
  await gps.search("parking", /Demo Parking/);
  await expect(page.getByTestId("navigation")).toContainText("This route has stairs outside");
  const before = parseInt(await page.getByTestId("distance").innerText(), 10);

  await page.getByRole("button", { name: "None of them" }).click();
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("checkbox", { name: /Avoid stairs/ }).check();
  await expect(page.getByTestId("navigation")).not.toContainText("This route has stairs outside");
  await expect.poll(async () => parseInt(await page.getByTestId("distance").innerText(), 10)).toBeGreaterThan(before);
  await expect(page.getByText("Not a promise that a wheelchair gets through")).toBeVisible();
});

test("cancelling keeps the destination, restarting goes on", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("hostel", /Demo Hostel/);
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("button", { name: "Cancel route" }).click();
  await expect(gps.status("cancelled")).toContainText("Demo Hostel");
  await page.waitForTimeout(2_500);
  await expect(gps.status("cancelled")).toBeVisible();

  await page.getByRole("button", { name: "Restart route" }).click();
  await expect(gps.status("active")).toBeVisible();
});

test("stopping forgets the position", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await page.getByRole("button", { name: "Stop using my location" }).click();

  await expect(page.getByTestId("permission-screen")).toBeVisible();
  await expect(page.getByTestId("user-dot")).toHaveCount(0);
});

test("the demo build still has the real permission screen without ?mock=1", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("browse-notice")).toBeVisible();
  await expect(page.getByTestId("mock-badge")).toHaveCount(0);
});
