import { test, expect } from "@playwright/test";
import { resetLockout, flushRateLimits } from "../../helpers/db";
import { ADMIN_ID, ADMIN_PW, ADMIN_EMAIL } from "../../helpers/credentials";

// Selectors matching the actual login page placeholders
const ID_FIELD = /admin@workstation\.local/i;
const PW_FIELD = /enter your password/i;

/**
 * Intercept ALL API requests: when no auth cookie is present, return 403
 * instead of letting the real 401 through. This prevents the client's
 * 401 → window.location.href = "/login" redirect loop on unauthenticated pages.
 *
 * The login endpoint itself (/api/auth/login) is excluded so the form works.
 */
async function blockUnauthenticatedApiRedirects(page: import("@playwright/test").Page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();

    // Always let the login endpoint through — it's the one we're testing
    if (url.includes("/api/auth/login")) {
      await route.continue();
      return;
    }

    const cookies = (await route.request().headerValue("cookie")) ?? "";
    if (cookies.includes("workstation_token")) {
      // Auth cookie present — let the real request through
      await route.continue();
    } else {
      // No auth — return 403 (not 401) to prevent the client's redirect loop
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not authenticated" }),
      });
    }
  });
}

// Clear any stored auth before each test and prevent the redirect loop
test.beforeEach(async ({ page }) => {
  await page.context().clearCookies();
  flushRateLimits();
  await blockUnauthenticatedApiRedirects(page);
});

// ---------------------------------------------------------------------------
// Login page rendering
// ---------------------------------------------------------------------------

test.describe("Login page", () => {
  test("renders sign in form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByPlaceholder(ID_FIELD)).toBeVisible();
    await expect(page.getByPlaceholder(PW_FIELD)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("sign in button is disabled when fields are empty", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const button = page.getByRole("button", { name: /sign in/i });
    await expect(button).toBeDisabled();
  });

  test("sign in button enables when both fields have values", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(ID_FIELD).fill(ADMIN_ID);
    await page.getByPlaceholder(PW_FIELD).fill("password");

    const button = page.getByRole("button", { name: /sign in/i });
    await expect(button).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

test.describe("Login flow", () => {
  test.beforeAll(() => {
    resetLockout(ADMIN_ID);
    flushRateLimits();
  });

  test.beforeEach(() => {
    flushRateLimits();
  });

  test("successful login redirects to /chat", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(ID_FIELD).fill(ADMIN_ID);
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to chat
    await page.waitForURL("**/chat", { timeout: 15_000 });
    expect(page.url()).toContain("/chat");
  });

  test("failed login shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(ID_FIELD).fill(ADMIN_ID);
    await page.getByPlaceholder(PW_FIELD).fill("wrongpassword");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();

    await page.getByRole("button", { name: /sign in/i }).click();

    // Error message should appear
    await expect(
      page.getByText(/invalid username\/email or password/i)
    ).toBeVisible({ timeout: 10_000 });

    // Should stay on login page
    expect(page.url()).toContain("/login");
  });

  test("can login with email identifier", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(ID_FIELD).fill(ADMIN_EMAIL);
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("**/chat", { timeout: 15_000 });
    expect(page.url()).toContain("/chat");
  });

  test("Enter key submits the form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(ID_FIELD).fill(ADMIN_ID);
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByPlaceholder(PW_FIELD).press("Enter");

    await page.waitForURL("**/chat", { timeout: 15_000 });
    expect(page.url()).toContain("/chat");
  });

  test("error clears when typing", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(ID_FIELD).fill(ADMIN_ID);
    await page.getByPlaceholder(PW_FIELD).fill("wrong");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();

    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/invalid username\/email or password/i)
    ).toBeVisible({ timeout: 10_000 });

    // Type in identifier to clear error
    await page.getByPlaceholder(ID_FIELD).fill("admin2");
    await expect(
      page.getByText(/invalid username\/email or password/i)
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Auth persistence
// ---------------------------------------------------------------------------

test.describe("Auth persistence", () => {
  test.beforeAll(() => {
    resetLockout(ADMIN_ID);
    flushRateLimits();
  });

  test.beforeEach(() => {
    flushRateLimits();
  });

  test("auth cookie is set after login", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByPlaceholder(ID_FIELD).fill(ADMIN_ID);
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/chat", { timeout: 15_000 });

    // Verify auth cookie exists (HttpOnly, so we check via API call)
    const meRes = await page.request.get("/api/auth/me");
    expect(meRes.status()).toBe(200);
    const body = await meRes.json();
    expect(body.username).toBe(ADMIN_ID);
  });
});
