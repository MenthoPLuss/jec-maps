import { MockGps, at, expect, onScreen, test } from "../support";

test("from the gate into a room, with every confirmation made by the user", async ({ page }) => {
  test.setTimeout(120_000);
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("A-102", /A-102 Demo Drawing Hall/);
  await expect(gps.status("active")).toBeVisible();
  await expect(page.getByTestId("navigation")).toContainText("The way inside has stairs");

  // The GPS goes quiet at the door. That is only a question.
  await gps.preset("To a door, then GPS lost");
  await expect(page.getByTestId("suggestion")).toContainText("Are you inside Demo Block A?", { timeout: 40_000 });
  await expect(page.getByTestId("building-bar")).toHaveCount(0);
  await expect(page.getByTestId("confirmed")).toHaveCount(0);

  // Yes: the building opens. The floor is still open.
  await page.getByRole("button", { name: "Yes, I'm inside" }).click();
  await expect(page.getByTestId("building-bar")).toContainText("Demo Block A");
  await expect(page.getByTestId("building-bar")).toContainText("Viewing: Ground floor");
  await expect(page.getByTestId("confirmed")).toContainText("You said you are in: Demo Block A");
  await expect(page.getByTestId("user-dot")).toHaveAttribute("data-indoors", "true");

  // Looking at another floor is not being there.
  const floors = page.getByTestId("floor-switcher");
  await floors.getByRole("button", { name: "Floor 1" }).click();
  await expect(page.getByTestId("building-bar")).toContainText("Viewing: Floor 1");
  await expect(page.getByTestId("confirmed")).not.toContainText("Floor 1,");
  await floors.getByRole("button", { name: "Ground floor" }).click();

  // The steps are moved on by hand and bring the right floor along.
  const steps = page.getByTestId("steps");
  await expect(steps.getByRole("listitem")).toHaveText([
    /Walk 20 m/,
    /Turn right and walk 10 m/,
    /Take the stairs up to Floor 1/,
    /Walk 20 m/,
    /A-102 Demo Drawing Hall is the 1st door on the left/,
  ]);
  for (let i = 0; i < 3; i++) await steps.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByTestId("building-bar")).toContainText("Viewing: Floor 1");
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("button", { name: "I'm on: Floor 1" }).click();
  await expect(page.getByTestId("confirmed")).toContainText("You said you are in: Floor 1, Demo Block A");

  // Only the user knows when they are in the room.
  await expect(page.getByTestId("arrived")).toHaveCount(0);
  await page.getByRole("button", { name: "I've reached the room" }).click();
  await expect(page.getByTestId("arrived")).toHaveText("You've reached the room");
  await expect(page.getByTestId("confirmed")).toContainText("A-102 Demo Drawing Hall, Floor 1, Demo Block A");

  // Leaving the view is not leaving the building.
  await page.getByRole("button", { name: "Exit building view" }).click();
  await expect(page.getByTestId("building-bar")).toHaveCount(0);
  await expect(page.getByTestId("confirmed")).toContainText("A-102");
  await page.getByRole("button", { name: "I'm outside" }).click();
  await expect(page.getByTestId("confirmed")).toHaveCount(0);
});

test("between two buildings there is a choice", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.preset("Between two buildings");
  const question = page.getByTestId("suggestion");
  await expect(question).toContainText("one of these buildings");
  await expect(question.getByRole("button", { name: "Demo Block B" })).toBeVisible();
  await expect(question.getByRole("button", { name: "Demo Library" })).toBeVisible();

  await question.getByRole("button", { name: "None of them" }).click();
  await expect(question).toHaveCount(0);
  await page.waitForTimeout(4_000);
  await expect(question).toHaveCount(0); // it doesn't nag
});

test("no bounce-back while the GPS jumps around inside, and a smooth way out", async ({ page }) => {
  test.setTimeout(90_000);
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.preset("To a door, then GPS lost");
  await page.getByRole("button", { name: "Yes, I'm inside" }).click({ timeout: 40_000 });
  await page.getByRole("button", { name: "Exit building view" }).click();

  // Bad GPS, then no GPS, then GPS somewhere else: still inside.
  await gps.slide("Accuracy", 60);
  await gps.panel((panel) => panel.getByRole("button", { name: "Signal: off" }).click());
  await gps.preset("Jitter at the boundary");
  await gps.slide("Accuracy", 60);
  await page.waitForTimeout(5_000);
  await expect(page.getByTestId("confirmed")).toContainText("Demo Block A");

  // Accurate and clearly outside for a while: that ends it.
  await gps.preset("Standing on campus");
  await expect(page.getByTestId("confirmed")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("user-dot")).toHaveAttribute("data-indoors", "false");
});

test("a room can be looked up, tapped on the plan, and walked to from another room", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("block a", /Demo Block A/);
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("button", { name: "Clear destination" }).click();
  await page.waitForTimeout(1_200);
  const wall = await onScreen(page, at(-110, 25));
  await page.touchscreen.tap(wall.x, wall.y);
  await page.getByRole("button", { name: "Look inside" }).click();
  await expect(page.getByTestId("building-panel")).toContainText("a sketch, not a survey");
  await page.waitForTimeout(1_500);

  // On the plan.
  const room = await onScreen(page, at(-107, 30));
  await page.touchscreen.tap(room.x, room.y);
  const card = page.getByTestId("room-card");
  await expect(card).toContainText("A-001 Demo Classroom 1");
  await expect(card).toContainText("Demo Department of Examples");
  await card.getByRole("button", { name: "I'm in this room" }).click();
  await expect(card).toContainText("You said you are here");
  await card.getByRole("button", { name: "Close" }).click();

  // In the list, filtered.
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("searchbox", { name: "Filter the rooms" }).fill("computer");
  await page.getByRole("button", { name: /A-105 Demo Computer Lab/ }).click();
  await card.getByRole("button", { name: "Go here" }).click();
  await expect(page.getByTestId("inside")).toContainText("An estimate");
  await expect(page.getByTestId("steps")).toContainText("Take the stairs up to Floor 1");
  await expect(page.getByTestId("distance")).toHaveCount(0);
});

test("avoiding stairs takes the lift inside", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("A-102", /A-102/);
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(page.getByTestId("steps")).toContainText("Take the stairs up");
  await page.getByRole("checkbox", { name: /Avoid stairs/ }).check();
  await expect(page.getByTestId("steps")).toContainText("Take the lift up to Floor 1");
  await expect(page.getByTestId("navigation")).not.toContainText("The way inside has stairs");
});

test("a floor without a plan has a list and a hint", async ({ page }) => {
  const gps = new MockGps(page);
  await gps.unlock();
  await gps.search("101", /101 Demo Lecture Hall/);
  await expect(page.getByTestId("navigation")).toContainText("The way inside is not drawn yet");
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(page.getByTestId("steps")).toContainText("Hint: top of the main stairs");
});

test("what the user said survives time and a missing signal", async ({ page }) => {
  const gps = new MockGps(page);
  await page.clock.install();
  await gps.unlock();
  await gps.search("A-001", /A-001/);
  await page.getByRole("button", { name: "Show more" }).click();
  await page.getByRole("button", { name: "Clear destination" }).click();
  await gps.preset("To a door, then GPS lost");
  await page.clock.runFor(25_000);
  await page.getByRole("button", { name: "Yes, I'm inside" }).click();

  await page.clock.runFor(60_000);
  await expect(page.getByTestId("confirmed")).toContainText("Demo Block A");
});

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the building view opens at once", async ({ page }) => {
    const gps = new MockGps(page);
    await gps.unlock();
    await gps.search("A-102", /A-102/);
    await page.getByRole("button", { name: "Show more" }).click();
    await page.getByTestId("steps").getByRole("button", { name: "Next step" }).click();
    await expect(page.getByTestId("building-bar")).toBeVisible();
    await page.getByRole("button", { name: "Exit building view" }).click();
    await expect(page.getByTestId("building-bar")).toHaveCount(0);
  });
});
