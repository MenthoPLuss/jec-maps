import { expect, test } from "../support";

test.describe("the review page", () => {
  // The browser reports the "not found" answer itself.
  test.use({ allowedErrors: [/404/] });

  test("does not exist in a normal build", async ({ page }) => {
    const response = await page.goto("/review");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("does not exist");
    await expect(page.getByTestId("file-input")).toHaveCount(0);
  });
});
