import { test, expect, Page } from "@playwright/test";
import { resetLockout, flushRateLimits } from "../../helpers/db";

const ADMIN_PW = "Admin123!";

// Selectors matching the actual login page placeholders
const ID_FIELD = /admin@workstation\.local/i;
const PW_FIELD = /enter your password/i;

async function loginAs(page: Page, identifier: string, password: string) {
  flushRateLimits();
  resetLockout("admin");
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByPlaceholder(ID_FIELD).fill(identifier);
  await page.getByPlaceholder(PW_FIELD).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/chat", { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

test.describe("Home page", () => {
  test("shows Sign In button when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByText("AI Workstation Chat")).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("shows Open Chat button when authenticated", async ({ page }) => {
    resetLockout("admin");
    await loginAs(page, "admin", ADMIN_PW);

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
  test.beforeAll(async () => {
    flushRateLimits();
    await resetLockout("admin");
  });

  test("chat index shows select conversation prompt", async ({ page }) => {
    await loginAs(page, "admin", ADMIN_PW);

    // Should see the default chat index content
    await expect(
      page.getByText(/select a conversation/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("chat page has sidebar layout", async ({ page }) => {
    await loginAs(page, "admin", ADMIN_PW);

    // Look for main layout wrapper and chat content area
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByText(/select a conversation/i)).toBeVisible();
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
    await expect(page.getByPlaceholder(ID_FIELD)).toBeVisible();
  });
});
