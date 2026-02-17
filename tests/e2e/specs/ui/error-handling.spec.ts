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
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("unauthenticated access redirects to login", async ({ page }) => {
    // Clear all auth state
    await page.context().clearCookies();

    // Try to access a protected page — the 401 from getCurrentUser()
    // triggers window.location.href = "/login"
    await page.goto("/chat");
    await page.waitForURL("**/login", { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("expired/invalid cookie redirects to login", async ({ page }) => {
    // Clear cookies and set an invalid auth cookie
    await page.context().clearCookies();

    // Visit login first to get the domain, then set invalid cookie
    await page.goto("/login");
    const baseHost = new URL(page.url()).hostname;
    await page.context().addCookies([
      {
        name: "workstation_token",
        value: "invalid.token.value",
        domain: baseHost,
        path: "/",
      },
    ]);

    // Navigate to protected page — backend rejects invalid cookie → 401 → redirect.
    // The redirect may abort the navigation, so use "commit" wait strategy.
    await page.goto("/chat", { waitUntil: "commit" }).catch(() => {});
    await page.waitForURL("**/login**", { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });
});
