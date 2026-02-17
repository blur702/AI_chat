import { test } from "@playwright/test";
import { checkAccessibility } from "../../helpers/a11y";
import { flushRateLimits } from "../../helpers/db";

test.describe("Login page accessibility", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("login page passes WCAG 2.1 AA", async ({ page }) => {
    await checkAccessibility(page);
  });
});
