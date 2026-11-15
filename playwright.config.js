import { defineConfig } from "@playwright/test";

// Uses the installed Chrome, so no browser download is needed.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.js",
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
  },
  webServer: {
    command: "node tests/e2e/start-test-server.mjs",
    url: "http://localhost:3100",
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
