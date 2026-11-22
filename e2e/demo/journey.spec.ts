import { MockGps, at, expect, expectMapDrawn, onScreen, test } from "../support";

test("the whole outdoor journey", async ({ page }) => {
  test.setTimeout(120_000);
  const gps = new MockGps(page);

  // Before anything is measured.
  await gps.open();
  await expect(page.getByTestId("permission-screen")).toContainText("It stays on this device");
  await expect(page.getByTestId("user-dot")).toHaveCount(0);

  // Far away: locked, with the distance.
  await gps.preset("Far outside (2.3 km)");
  await page.getByRole("button", { name: "Enable location" }).click();
  await expect(page.getByTestId("locked-screen")).toContainText("2.3 km");
  await expect(page.getByTestId("user-dot")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);

  // Walking in unlocks the map.
  await gps.preset("Outside → into campus");
  await expect(page.getByTestId("quality")).toContainText("GPS good", { timeout: 40_000 });
  await expect(page.getByTestId("user-dot")).toBeVisible();
  await expect(page.getByTestId("announcer")).toContainText(/unlocked/);
  await expectMapDrawn(page);

  // A destination, a route, and numbers that go down.
  await gps.search("canteen", /Demo Canteen/);
  await expect(gps.status("active")).toBeVisible();
  const distance = page.getByTestId("distance");
  const first = parseInt(await distance.innerText(), 10);
  expect(first).toBeGreaterThan(100);
  await expect(page.getByTestId("eta")).toContainText("min");

  await gps.slide("Speed", 8);
  await gps.preset("Walk the route");
  await expect.poll(async () => parseInt(await distance.innerText(), 10)).toBeLessThan(first - 30);

  // Arrival, announced once.
  await expect(page.getByTestId("arrived")).toHaveText("You've arrived", { timeout: 60_000 });
  await expect(page.getByTestId("announcer")).toHaveText("You've arrived: Demo Canteen");

  // And again, then no more.
  await page.getByRole("button", { name: "Restart route" }).click();
  await expect(page.getByTestId("arrived")).toHaveCount(0);
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("button", { name: "Clear destination" }).click();
  await expect(page.getByTestId("hint")).toBeVisible();
  await expect(page.getByTestId("destination-pin")).toHaveCount(0);
});

test("walking out locks the map again, without flicker at the boundary", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();

  await gps.preset("Jitter at the boundary");
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId("locked-screen")).toHaveCount(0);
  }

  await gps.preset("Campus → outside");
  await expect(page.getByTestId("locked-screen")).toBeVisible({ timeout: 50_000 });
  await expect(page.getByTestId("user-dot")).toHaveCount(0);
});

test("a click drops one pin, which can be dragged and cleared", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  const pin = page.getByTestId("destination-pin");

  // South-west of the user, next to nothing.
  const spot = await onScreen(page, at(-30, -120));
  await page.mouse.click(spot.x, spot.y);
  await expect(pin).toHaveCount(1);
  await expect(page.getByTestId("navigation")).toContainText("Dropped pin");

  const other = await onScreen(page, at(25, -120));
  await page.mouse.click(other.x, other.y);
  await expect(pin).toHaveCount(1);

  const box = (await pin.boundingBox())!;
  const before = await page.getByTestId("navigation").innerText();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 60, box.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.getByTestId("navigation").innerText()).not.toBe(before);
  await expect(pin).toHaveCount(1);
});

test("a long press drops a pin; a tap, a drag and a pinch don't", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  const pin = page.getByTestId("destination-pin");
  const { x, y } = await onScreen(page, at(-25, -120));
  const client = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]) =>
    client.send("Input.dispatchTouchEvent", { type, touchPoints: points });

  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(800);
  await expect(pin).toHaveCount(0);

  await touch("touchStart", [{ x, y }]);
  await touch("touchMove", [{ x: x + 40, y }]);
  await page.waitForTimeout(800);
  await touch("touchEnd", []);
  await expect(pin).toHaveCount(0);

  await touch("touchStart", [{ x, y }]);
  await touch("touchStart", [{ x, y }, { x: x + 60, y: y + 60 }]);
  await page.waitForTimeout(800);
  await touch("touchEnd", []);
  await expect(pin).toHaveCount(0);

  await touch("touchStart", [{ x, y }]);
  await page.waitForTimeout(800);
  await touch("touchEnd", []);
  await expect(pin).toHaveCount(1);
  await expect(page.getByTestId("navigation")).toContainText("Dropped pin");
});

test("the keyboard alone is enough to set a destination", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();

  await page.getByRole("combobox", { name: "Search the campus" }).focus();
  await page.keyboard.type("a102");
  await expect(page.getByRole("option").first()).toContainText("A-102 Demo Drawing Hall");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("navigation")).toContainText("A-102");

  await page.getByRole("button", { name: "Set destination at the middle of the map" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("navigation")).toContainText("Dropped pin");
});

test("moving the map stops following, the button starts it again", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  const button = page.getByTestId("recenter");
  await expect(button).toHaveAttribute("aria-pressed", "true");

  await page.mouse.move(200, 400);
  await page.mouse.down();
  await page.mouse.move(120, 330, { steps: 6 });
  await page.mouse.up();
  await expect(button).toHaveAttribute("aria-pressed", "false");

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const dot = page.getByTestId("user-dot");
  await expect
    .poll(async () => {
      const box = (await dot.boundingBox())!;
      return Math.abs(box.x + box.width / 2 - 206);
    })
    .toBeLessThan(30);
});

test("the fake GPS can be moved by clicking, without setting a destination", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  const dot = page.getByTestId("user-dot");
  const before = await dot.getAttribute("data-lng");

  await gps.panel((panel) => panel.getByRole("radio", { name: "moves the fake user" }).check());
  const { x, y } = await onScreen(page, at(-30, -120));
  await page.mouse.click(x, y);

  await expect.poll(() => dot.getAttribute("data-lng")).not.toBe(before);
  await expect(page.getByTestId("destination-pin")).toHaveCount(0);
});

test("tapping a building shows it, and moves nobody", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("block b", /Demo Block B/);
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("button", { name: "Clear destination" }).click();
  await page.waitForTimeout(1_500);

  const dot = page.getByTestId("user-dot");
  const before = await dot.getAttribute("data-lng");
  const { x, y } = await onScreen(page, at(35, 30));
  await page.touchscreen.tap(x, y);
  await expect(page.getByTestId("selection")).toContainText("Demo Block B");
  await expect(page.getByTestId("navigation")).toHaveCount(0);
  expect(await dot.getAttribute("data-lng")).toBe(before);

  await page.getByRole("button", { name: "Go here" }).click();
  await expect(page.getByTestId("navigation")).toContainText("Demo Block B");
});

test("the destination survives a reload, the position and the room don't", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("hostel", /Demo Hostel/);
  await expect(gps.status("active")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("permission-screen")).toContainText("Demo Hostel");
  await expect(page.getByTestId("user-dot")).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).toContain("demo-hostel");
  expect(stored).not.toMatch(/94\.\d|26\.\d/);

  await page.getByRole("button", { name: "Remove it" }).click();
  expect(await page.evaluate(() => localStorage.getItem("jec-maps:destination"))).toBeNull();
});
