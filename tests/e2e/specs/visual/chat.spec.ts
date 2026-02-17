import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Chat visual regression", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page);
    await page.waitForLoadState("networkidle");
  });

  test("chat page matches baseline", async ({ page }) => {
    // Wait for sidebar and main content to settle
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("chat-page.png", {
      maxDiffPixelRatio: 0.05,
    });
  });
});
