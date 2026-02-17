import { test, expect } from "@playwright/test";
import { flushRateLimits } from "../../helpers/db";

test.describe("Core Web Vitals", () => {
  test.beforeEach(() => {
    flushRateLimits();
  });

  test("login page loads within performance budget", async ({ page }) => {
    const start = Date.now();
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    const domContentLoaded = Date.now() - start;

    // DOM content loaded should be under 3 seconds
    expect(domContentLoaded).toBeLessThan(3000);
  });

  test("login page FCP is under 2 seconds", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Measure First Contentful Paint
    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType(
        "paint"
      ) as PerformancePaintTiming[];
      const fcpEntry = entries.find((e) => e.name === "first-contentful-paint");
      return fcpEntry?.startTime ?? null;
    });

    if (fcp !== null) {
      expect(fcp).toBeLessThan(2000);
    }
  });

  test("chat page loads within performance budget", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(/admin@workstation\.local/i).fill("admin");
    await page.getByPlaceholder(/enter your password/i).fill("Admin123!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/chat", { timeout: 15_000 });

    // Measure time to navigate to chat
    const start = Date.now();
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const chatLoadTime = Date.now() - start;

    // Chat page DOM content loaded should be under 5 seconds
    expect(chatLoadTime).toBeLessThan(5000);
  });

  test("no excessive DOM nodes on login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const nodeCount = await page.evaluate(
      () => document.querySelectorAll("*").length
    );
    // Login page should not have excessive DOM nodes
    expect(nodeCount).toBeLessThan(1500);
  });
});
