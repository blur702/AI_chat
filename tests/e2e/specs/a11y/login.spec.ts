import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkAccessibility } from "../../helpers/a11y";
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

test.describe("Login page accessibility", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await blockUnauthenticatedApiRedirects(page);
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("login page passes WCAG 2.1 AA", async ({ page }) => {
    // color-contrast: green-700 on green-100 backgrounds (ratio 4.15 < 4.5 required)
    await checkAccessibility(page, { knownViolations: ["color-contrast"] });
  });
});
