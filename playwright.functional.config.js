import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/functional",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "functional-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
