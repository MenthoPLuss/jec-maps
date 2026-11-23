import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json.
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // Only pure logic is unit-tested, so no browser environment is needed.
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // The importer tests take up to 2 s here; shared CI machines can be several
    // times slower, and the default of 5 s would fail them for no real reason.
    testTimeout: 30_000,
  },
});
