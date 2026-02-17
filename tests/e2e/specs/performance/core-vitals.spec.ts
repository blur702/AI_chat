import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

async function blockUnauthenticatedApiRedirects(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/auth/login")) {
      await route.continue();
      return;
    }
    const cookies = (await route.request().headerValue("cookie")) ?? "";
    if (cookies.includes("workstation_token")) {
      await route.continue();
    } else {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not authenticated" }),
      });
    }
  });
}

test.describe("Core Web Vitals", () => {
  test.beforeEach(() => {
    flushRateLimits();
  });

  test("login page loads within performance budget", async ({ page }) => {
    await blockUnauthenticatedApiRedirects(page);
    const start = Date.now();
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    const domContentLoaded = Date.now() - start;

    // DOM content loaded should be under 3 seconds
    expect(domContentLoaded).toBeLessThan(3000);
  });

  test("login page FCP is under 2 seconds", async ({ page }) => {
    await blockUnauthenticatedApiRedirects(page);
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
    await loginAsAdmin(page);

    // Measure time to reload chat page
    const start = Date.now();
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const chatLoadTime = Date.now() - start;

    // Chat page DOM content loaded should be under 5 seconds
    expect(chatLoadTime).toBeLessThan(5000);
  });

  test("no excessive DOM nodes on login page", async ({ page }) => {
    await blockUnauthenticatedApiRedirects(page);
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const nodeCount = await page.evaluate(
      () => document.querySelectorAll("*").length
    );
    // Login page should not have excessive DOM nodes
    expect(nodeCount).toBeLessThan(1500);
  });
});
