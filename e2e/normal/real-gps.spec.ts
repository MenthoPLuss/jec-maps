import { at, expect, reviewedCore, test, type LngLat } from "../support";

const place = ([longitude, latitude]: LngLat, accuracy = 8) => ({ longitude, latitude, accuracy });

test.describe("with the demo data", () => {
  test.use({ geolocation: place(at(0, -50)), permissions: ["geolocation"] });

  test("real GPS in the middle of the campus gets no dot, distance or route", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("browse-notice")).toContainText("made-up demo");

    await page.getByRole("button", { name: "Check my GPS signal" }).click();
    await expect(page.getByTestId("gps-check")).toContainText("±8 m");
    await expect(page.getByTestId("user-dot")).toHaveCount(0);
    await expect(page.getByTestId("quality")).toHaveCount(0);

    await page.getByRole("combobox", { name: "Search the campus" }).fill("canteen");
    await page.getByRole("option", { name: /Demo Canteen/ }).click();
    await expect(page.getByTestId("selection")).toContainText("Demo Canteen");
    await expect(page.getByRole("button", { name: "Go here" })).toHaveCount(0);
    await expect(page.getByTestId("distance")).toHaveCount(0);
  });
});

test.describe("with reviewed data", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/data/core.json", (route) => route.fulfill({ json: reviewedCore() }));
  });

  test.describe("and permission", () => {
    test.use({ geolocation: place(at(0, -2_500)), permissions: ["geolocation"] });

    test("the same journey works with the browser's own GPS", async ({ page, context }) => {
      await page.goto("/");
      await expect(page.getByTestId("permission-screen")).toBeVisible();
      await expect(page.getByTestId("demo-badge")).toHaveCount(0);

      await page.getByRole("button", { name: "Enable location" }).click();
      await expect(page.getByTestId("locked-screen")).toContainText("2.3 km");

      await context.setGeolocation(place(at(0, -150)));
      await page.waitForTimeout(1_300);
      await context.setGeolocation(place(at(0, -149)));
      await expect(page.getByTestId("quality")).toBeVisible();

      await page.getByRole("combobox", { name: "Search the campus" }).fill("canteen");
      await page.getByRole("option", { name: /Demo Canteen/ }).click();
      await expect(page.getByTestId("distance")).toContainText("m");
    });

    test("a hidden page stops measuring and goes on when it is back", async ({ page, context }) => {
      await page.addInitScript(() => {
        const calls = { watch: 0, clear: 0 };
        (window as unknown as { gpsCalls: typeof calls }).gpsCalls = calls;
        const { geolocation } = navigator;
        const watch = geolocation.watchPosition.bind(geolocation);
        const clear = geolocation.clearWatch.bind(geolocation);
        geolocation.watchPosition = (...args) => (calls.watch++, watch(...args));
        geolocation.clearWatch = (id) => (calls.clear++, clear(id));
      });
      const calls = () => page.evaluate(() => (window as unknown as { gpsCalls: { watch: number; clear: number } }).gpsCalls);
      const setHidden = (hidden: boolean) =>
        page.evaluate((value) => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
          document.dispatchEvent(new Event("visibilitychange"));
        }, hidden);

      await context.setGeolocation(place(at(0, -150)));
      await page.goto("/");
      await expect(page.getByTestId("permission-screen")).toBeVisible();
      expect(await calls()).toEqual({ watch: 0, clear: 0 }); // nothing before the button

      await page.getByRole("button", { name: "Enable location" }).click();
      await expect.poll(calls).toEqual({ watch: 1, clear: 0 });
      await setHidden(true);
      await expect.poll(calls).toEqual({ watch: 1, clear: 1 });
      await setHidden(false);
      await expect.poll(calls).toEqual({ watch: 2, clear: 1 });
    });
  });

  test.describe("and no permission", () => {
    test.use({ permissions: [] });

    test("explains how to allow it, and can try again", async ({ page, context }) => {
      // A browser that says no.
      await page.addInitScript(() => {
        navigator.geolocation.watchPosition = (_success, error) => {
          setTimeout(() => error?.({ code: 1, message: "denied" } as GeolocationPositionError), 50);
          return 1;
        };
      });
      await page.goto("/");
      await page.getByRole("button", { name: "Enable location" }).click();
      await expect(page.getByTestId("problem-denied")).toContainText("Allow");

      await context.grantPermissions([]);
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.getByTestId("problem-denied")).toBeVisible();
    });
  });

  test("the locked map can't be moved", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("permission-screen")).toBeVisible();
    await expect(page.getByTestId("map")).toHaveAttribute("data-locked", "true");
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeHidden();
    await expect(page.getByRole("combobox")).toHaveCount(0);

    for (const name of ["About", "Privacy", "Help"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
  });
});
