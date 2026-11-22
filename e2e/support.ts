import { test as base, expect, type Locator, type Page } from "@playwright/test";

import { published, reviewedFiles } from "../src/lib/data/testing";

export { expect };

/**
 * Every test fails when the page talks to another site, when a request carries a
 * position, or when the page logs an error. A test that breaks something on purpose
 * can allow the error it causes.
 */
export const test = base.extend<{ allowedErrors: RegExp[]; allowedHosts: string[]; guard: void }>({
  allowedErrors: [[], { option: true }],
  allowedHosts: [[], { option: true }],

  guard: [
    async ({ page, context, baseURL, allowedErrors, allowedHosts }, use, testInfo) => {
      const ownHost = new URL(baseURL as string).host;
      const foreign: string[] = [];
      const leaks: string[] = [];
      const errors: string[] = [];
      const diary: string[] = [];

      await context.route(
        (url) => url.protocol.startsWith("http") && url.host !== ownHost && !allowedHosts.includes(url.host),
        (route) => {
          foreign.push(route.request().url());
          return route.abort();
        },
      );
      page.on("request", (request) => {
        const text = `${decodeURIComponent(request.url())} ${request.postData() ?? ""}`;
        // Any coordinate around Jorhat, whichever way round.
        if (/\b94\.2\d{2,}|\b26\.7\d{2,}/.test(text) || (request.method() !== "GET" && request.method() !== "HEAD")) {
          leaks.push(`${request.method()} ${text}`);
        }
      });
      page.on("console", (message) => {
        diary.push(`${message.type()}: ${message.text()}`);
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("requestfailed", (request) => diary.push(`failed: ${request.url()} ${request.failure()?.errorText}`));
      page.on("pageerror", (error) => errors.push(error.message));

      await use();

      // What the page said, for whoever has to find out why it failed.
      if (testInfo.status !== testInfo.expectedStatus) {
        console.log(["---", testInfo.title, ...diary].join("\n"));
      }
      expect(foreign, "requests to other sites").toEqual([]);
      expect(leaks, "requests that carry a position").toEqual([]);
      expect(
        errors.filter((error) => !allowedErrors.some((allowed) => allowed.test(error))),
        "errors in the console",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

// --- The map -----------------------------------------------------------------

/** How many clearly different colours the middle of the screen shows. A blank map shows one. */
async function coloursOnMap(page: Page): Promise<number> {
  const size = page.viewportSize();
  if (!size) throw new Error("no viewport");
  const shot = await page.screenshot({
    clip: { x: 0, y: size.height * 0.25, width: size.width * 0.8, height: size.height * 0.4 },
  });

  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const counts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4 * 7) {
      const key = [data[i] >> 3, data[i + 1] >> 3, data[i + 2] >> 3].join();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Ignore stray pixels, such as the edges of letters.
    const enough = (data.length / (4 * 7)) * 0.003;
    return [...counts.values()].filter((count) => count > enough).length;
  }, shot.toString("base64"));
}

/** Fails while the map is blank: campus, paths and buildings each have their own colour. */
export async function expectMapDrawn(page: Page): Promise<void> {
  await expect.poll(() => coloursOnMap(page), { message: "colours on the map", timeout: 20_000 }).toBeGreaterThanOrEqual(4);
}

export type LngLat = [number, number];

/** Where a coordinate is on the screen. Only in demo builds. */
export async function onScreen(page: Page, position: LngLat): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (at) => (window as unknown as { __jecMaps: { project(p: number[]): { x: number; y: number } } }).__jecMaps.project(at),
    position,
  );
}

// --- The demo campus ---------------------------------------------------------

/** Metres east and north of the campus centre, as the demo campus is drawn. */
export function at(x: number, y: number): LngLat {
  const metresPerDegree = (6_371_008.8 * Math.PI) / 180;
  return [94.2506399 + x / (metresPerDegree * Math.cos((26.7458283 * Math.PI) / 180)), 26.7458283 + y / metresPerDegree];
}

/** The dataset a reviewed, real campus would publish. Only for tests. */
export const reviewedCore = () => published(reviewedFiles()).core;

// --- The fake GPS ------------------------------------------------------------

export class MockGps {
  constructor(private readonly page: Page) {}

  async open(path = "/?mock=1"): Promise<void> {
    await this.page.goto(path);
    await expect(this.page.getByTestId("mock-badge")).toBeVisible();
  }

  async panel(action: (panel: Locator) => Promise<void>): Promise<void> {
    const panel = this.page.getByTestId("mock-panel");
    await this.page.getByTestId("mock-badge").click();
    await expect(panel).toBeVisible();
    await action(panel);
    await this.page.getByTestId("mock-badge").click();
    await expect(panel).toBeHidden();
  }

  async preset(name: string): Promise<void> {
    await this.panel((panel) => panel.getByRole("button", { name, exact: true }).click());
  }

  async slide(label: "Speed" | "Accuracy" | "Jitter", value: number): Promise<void> {
    await this.panel((panel) => panel.getByRole("slider", { name: label }).fill(String(value)));
  }

  /** The permission screen, then standing on campus. */
  async unlock(): Promise<void> {
    await this.open();
    await this.preset("Standing on campus");
    await this.page.getByRole("button", { name: "Enable location" }).click();
    await expect(this.page.getByTestId("quality")).toBeVisible();
    await expect(this.page.getByTestId("user-dot")).toBeVisible();
  }

  async search(text: string, option: string | RegExp): Promise<void> {
    await this.page.getByRole("combobox", { name: "Search the campus" }).fill(text);
    await this.page.getByRole("option", { name: option }).first().click();
  }

  status(status: string): Locator {
    return this.page.locator(`[data-testid="navigation"][data-status="${status}"]`);
  }
}
