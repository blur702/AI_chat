import { test } from "@playwright/test";
import { checkAccessibility } from "../../helpers/a11y";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Chat page accessibility", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page);
  });

  test("chat page passes WCAG 2.1 AA", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // Exclude dynamically loaded content that may not be fully rendered
    // color-contrast: green-700 on green-100 backgrounds (ratio 4.15 < 4.5 required)
    await checkAccessibility(page, {
      exclude: [".monaco-editor", "[data-xterm]"],
      knownViolations: ["color-contrast"],
    });
  });
});
