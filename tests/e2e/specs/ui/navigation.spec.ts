import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { resetLockout, flushRateLimits } from "../../helpers/db";
import { ADMIN_ID } from "../../helpers/credentials";

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

test.describe("Home page", () => {
  test("shows Sign In button when unauthenticated", async ({ page }) => {
    await page.context().clearCookies();

    // Block ALL unauthenticated API requests (not just /auth/me)
    // to prevent the client's 401 → window.location.href = "/login" redirect loop
    await page.route("**/api/**", async (route) => {
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

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("AI Workstation Chat")).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("shows Open Chat button when authenticated", async ({ page }) => {
    flushRateLimits();
    resetLockout(ADMIN_ID);
    await loginAsAdmin(page);

    await page.goto("/");
    await expect(page.getByRole("link", { name: /open chat/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Chat page layout
// ---------------------------------------------------------------------------

test.describe("Chat page", () => {
  test.beforeAll(() => {
    flushRateLimits();
    resetLockout(ADMIN_ID);
  });

  test("chat index shows empty state message", async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page);

    // Should see the empty state — may differ based on whether chats exist
    await expect(
      page.getByText(/no messages yet|start a conversation|select a conversation|new chat/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("chat page has sidebar layout", async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page);

    // Look for main layout wrapper and sidebar content
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByText(/chats/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Sandbox login
// ---------------------------------------------------------------------------

test.describe("Sandbox app", () => {
  test("sandbox login page loads", async ({ page }) => {
    // Sandbox is on port 3002 — may not be directly exposed
    try {
      await page.goto("http://localhost:3002/login", { timeout: 5_000 });
    } catch {
      test.skip(true, "Sandbox port 3002 not reachable");
      return;
    }

    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible();
    await expect(page.getByPlaceholder(/admin@workstation\.local/i)).toBeVisible();
  });
});
