import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  retries: 1,
  workers: 1, // Required: tests share Redis/DB state and cannot run in parallel
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
    {
      name: "a11y",
      testMatch: /a11y\/.+\.spec\.ts$/,
    },
    {
      name: "visual",
      testMatch: /visual\/.+\.spec\.ts$/,
    },
    {
      name: "performance",
      testMatch: /performance\/.+\.spec\.ts$/,
    },
    {
      name: "mobile",
      testMatch: /responsive\/.+\.spec\.ts$/,
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tablet",
      testMatch: /responsive\/.+\.spec\.ts$/,
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
});
