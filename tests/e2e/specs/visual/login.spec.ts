import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
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

test.describe("Login visual regression", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await blockUnauthenticatedApiRedirects(page);
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
