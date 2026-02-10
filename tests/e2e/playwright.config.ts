import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "api",
      testMatch: /api\/.+\.spec\.ts$/,
    },
    {
      name: "ui",
      testMatch: /ui\/.+\.spec\.ts$/,
      dependencies: ["api"],
    },
  ],
});
