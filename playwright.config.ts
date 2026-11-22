import { defineConfig, devices } from "@playwright/test";

const phone = {
  ...devices["Pixel 7"],
  launchOptions: {
    // Software WebGL, so the map also draws on machines without a GPU.
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
};

export default defineConfig({
  testDir: "./e2e",
  // The software-drawn maps and their timing suffer when many run at once.
  workers: process.env.CI ? 1 : 2,
  timeout: 60_000,
  // Drawing the map in software takes its time.
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  projects: [
    // Three builds, because public settings are fixed while building.
    { name: "normal", testMatch: /normal\/.*\.spec\.ts/, use: { ...phone, baseURL: "http://localhost:3100" } },
    { name: "demo", testMatch: /demo\/.*\.spec\.ts/, use: { ...phone, baseURL: "http://localhost:3101" } },
    { name: "online", testMatch: /online\/.*\.spec\.ts/, use: { ...phone, baseURL: "http://localhost:3102" } },
  ],
  webServer: {
    command: "node scripts/e2e-servers.mjs",
    // The last of the three to start.
    url: "http://localhost:3102",
    reuseExistingServer: Boolean(process.env.E2E_REUSE),
    timeout: 400_000,
  },
});
