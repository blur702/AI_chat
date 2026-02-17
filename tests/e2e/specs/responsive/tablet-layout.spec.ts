import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Tablet layout", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
  });

  test("login page renders on tablet", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("chat page is usable on tablet", async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState("networkidle");

    const input = page.locator('[aria-label="Message input"], textarea').first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill("Tablet test");
    await expect(input).toHaveValue("Tablet test");
  });
});
