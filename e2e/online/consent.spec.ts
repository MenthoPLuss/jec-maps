import { expect, expectMapDrawn, test } from "../support";

const HOST = "tiles.example.test";
const style = {
  version: 8,
  sources: {},
  layers: [{ id: "provider-background", type: "background", paint: { "background-color": "#aaddaa" } }],
};

test.use({ allowedHosts: [HOST] });

test("asks before it loads anything from the provider", async ({ page }) => {
  const requests: string[] = [];
  await page.route(`https://${HOST}/**`, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: style });
  });
  await page.goto("/");
  await expect(page.getByTestId("online-map-prompt")).toContainText(HOST);
  await expectMapDrawn(page); // the campus is there without it
  expect(requests).toEqual([]);

  await page.getByRole("button", { name: "Load street map" }).click();
  await expect.poll(() => requests).toEqual([`https://${HOST}/style.json`]);
  await expect(page.getByTestId("online-map-prompt")).toHaveCount(0);
  await expectMapDrawn(page); // our own layers came back on top of the new style
});

test("takes no for an answer, also next time", async ({ page }) => {
  const requests: string[] = [];
  await page.route(`https://${HOST}/**`, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Keep simple map" }).click();
  await page.reload();
  await expectMapDrawn(page);

  await expect(page.getByTestId("online-map-prompt")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test.describe("when the provider is down", () => {
  test.use({ allowedErrors: [/ERR_FAILED/] });

  test("the campus map stays", async ({ page }) => {
    await page.route(`https://${HOST}/**`, (route) => route.abort());
    await page.goto("/");
    await page.getByRole("button", { name: "Load street map" }).click();

    await expect(page.getByText("The street map could not be loaded")).toBeVisible();
    await expectMapDrawn(page);
  });
});

test("the privacy page names the provider", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText(HOST)).toBeVisible();
});
