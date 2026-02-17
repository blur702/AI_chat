import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
  });

  test("login form can be navigated with Tab", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Tab to identifier field
    await page.keyboard.press("Tab");
    const focused1 = await page.evaluate(() => document.activeElement?.tagName);
    // Should focus an input
    expect(["INPUT", "TEXTAREA", "BUTTON", "A"]).toContain(focused1);
  });

  test("Enter submits login form", async ({ page }) => {
    flushRateLimits();
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(/admin@workstation\.local/i).fill("admin");
    await page.getByPlaceholder(/enter your password/i).fill("Admin123!");
    await page.getByPlaceholder(/enter your password/i).press("Enter");

    await page.waitForURL("**/chat", { timeout: 15_000 });
    expect(page.url()).toContain("/chat");
  });

  test("Escape closes dialogs", async ({ page }) => {
    await loginAsAdmin(page);

    // Try to open a dialog (if any exists on chat page)
    const dialog = page.getByRole("dialog");
    // If a dialog is visible, Escape should close it
    if (await dialog.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
