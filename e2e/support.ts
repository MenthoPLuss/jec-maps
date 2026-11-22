import { test as base, expect, type Page } from "@playwright/test";

export { expect };

/**
 * Every test fails when the page talks to another site or logs an error.
 * A test that breaks something on purpose can allow the error it causes.
 */
export const test = base.extend<{ allowedErrors: RegExp[]; guard: void }>({
  allowedErrors: [[], { option: true }],

  guard: [
    async ({ page, context, baseURL, allowedErrors }, use) => {
      const ownHost = new URL(baseURL as string).host;
      const foreign: string[] = [];
      const errors: string[] = [];

      await context.route(
        (url) => url.protocol.startsWith("http") && url.host !== ownHost,
        (route) => {
          foreign.push(route.request().url());
          return route.abort();
        },
      );
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await use();

      expect(foreign, "requests to other sites").toEqual([]);
      expect(
        errors.filter((error) => !allowedErrors.some((allowed) => allowed.test(error))),
        "errors in the console",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

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
  await expect.poll(() => coloursOnMap(page), { message: "colours on the map", timeout: 15_000 }).toBeGreaterThanOrEqual(4);
}
