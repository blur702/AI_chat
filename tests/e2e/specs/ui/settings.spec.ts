import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page, "/settings");
  });

  test("settings page loads", async ({ page }) => {
    await expect(page.getByText(/settings/i)).toBeVisible({ timeout: 10_000 });
  });

  test("has profile section", async ({ page }) => {
    await expect(
      page.getByText(/profile|account|user/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("can navigate back to chat", async ({ page }) => {
    const chatLink = page.getByRole("link", { name: /chat/i }).first();
    if (await chatLink.isVisible()) {
      await chatLink.click();
      await page.waitForURL("**/chat", { timeout: 10_000 });
      expect(page.url()).toContain("/chat");
    }
  });
});
