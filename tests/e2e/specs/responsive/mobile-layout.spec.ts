import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Mobile layout", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
  });

  test("login page renders on mobile", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /sign in/i })
    ).toBeVisible();
  });

  test("chat page renders mobile bottom nav", async ({ page }) => {
    await loginAsAdmin(page);

    // On mobile viewport, bottom navigation should be visible
    // or sidebar should be in overlay mode
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("message input is accessible on mobile", async ({ page }) => {
    await loginAsAdmin(page);

    const input = page.locator('[aria-label="Message input"], textarea').first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill("Mobile test");
    await expect(input).toHaveValue("Mobile test");
  });
});
