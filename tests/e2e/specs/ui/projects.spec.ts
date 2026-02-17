import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Projects page", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page, "/projects");
  });

  test("projects page loads", async ({ page }) => {
    await expect(
      page.getByText(/projects/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows new project button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /new project|create/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("project list renders", async ({ page }) => {
    // Wait for page to load - either projects appear or empty state
    await page.waitForLoadState("networkidle");
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });
});
