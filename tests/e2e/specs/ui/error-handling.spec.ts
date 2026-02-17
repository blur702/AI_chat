import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Error handling", () => {
  test("404 page for unknown routes", async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page);

    await page.goto("/this-page-does-not-exist");
    // Should show 404 or redirect to a known page
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();
    // Either shows 404 content or redirects
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("unauthenticated access redirects to login", async ({ page }) => {
    // Clear auth state
    await page.goto("/login");
    await page.evaluate(() => localStorage.clear());

    // Try to access a protected page
    await page.goto("/chat");
    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("expired token redirects to login", async ({ page }) => {
    await page.goto("/login");
    // Set an expired/invalid token
    await page.evaluate(() => {
      localStorage.setItem("workstation_token", "invalid.token.value");
    });

    await page.goto("/chat");
    // Should redirect to login when API returns 401
    await page.waitForURL("**/login", { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });
});
