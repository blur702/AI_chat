import { test, expect } from "@playwright/test";
import { flushRateLimits } from "../../helpers/db";

test.describe("Login visual regression", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
  });

  test("login page matches baseline", async ({ page }) => {
    await expect(page).toHaveScreenshot("login-page.png", {
      maxDiffPixelRatio: 0.05,
    });
  });

  test("login error state matches baseline", async ({ page }) => {
    await page.getByPlaceholder(/admin@workstation\.local/i).fill("admin");
    await page.getByPlaceholder(/enter your password/i).fill("wrong");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/invalid/i)
    ).toBeVisible({ timeout: 10_000 });

    await expect(page).toHaveScreenshot("login-error.png", {
      maxDiffPixelRatio: 0.05,
    });
  });
});
