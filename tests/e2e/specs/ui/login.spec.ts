import { test, expect } from "@playwright/test";
import { resetLockout, flushRateLimits } from "../../helpers/db";

const ADMIN_PW = "Admin123!";

// Selectors matching the actual login page placeholders
const ID_FIELD = /admin@workstation\.local/i;
const PW_FIELD = /enter your password/i;

// Clear any stored tokens before each test
test.beforeEach(async ({ page }) => {
  // Clear tokens first via a blank page to avoid redirect loops
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
});

// ---------------------------------------------------------------------------
// Login page rendering
// ---------------------------------------------------------------------------

test.describe("Login page", () => {
  test("renders sign in form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByPlaceholder(ID_FIELD)).toBeVisible();
    await expect(page.getByPlaceholder(PW_FIELD)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("sign in button is disabled when fields are empty", async ({ page }) => {
    await page.goto("/login");

    const button = page.getByRole("button", { name: /sign in/i });
    await expect(button).toBeDisabled();
  });

  test("sign in button enables when both fields have values", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder(ID_FIELD).fill("admin");
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
    resetLockout("admin");
    flushRateLimits();
  });

  test.beforeEach(() => {
    flushRateLimits();
  });

  test("successful login redirects to /chat", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder(ID_FIELD).fill("admin");
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to chat
    await page.waitForURL("**/chat", { timeout: 10_000 });
    expect(page.url()).toContain("/chat");
  });

  test("failed login shows error message", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Retry fill until React hydration completes and button enables
    await expect(async () => {
      await page.getByPlaceholder(ID_FIELD).fill("admin");
      await page.getByPlaceholder(PW_FIELD).fill("wrongpassword");
      await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
    }).toPass({ timeout: 10_000 });

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

    await page.getByPlaceholder(ID_FIELD).fill("admin@workstation.local");
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("**/chat", { timeout: 10_000 });
    expect(page.url()).toContain("/chat");
  });

  test("Enter key submits the form", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder(ID_FIELD).fill("admin");
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByPlaceholder(PW_FIELD).press("Enter");

    await page.waitForURL("**/chat", { timeout: 10_000 });
    expect(page.url()).toContain("/chat");
  });

  test("error clears when typing", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Retry fill until React hydration completes and button enables
    await expect(async () => {
      await page.getByPlaceholder(ID_FIELD).fill("admin");
      await page.getByPlaceholder(PW_FIELD).fill("wrong");
      await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
    }).toPass({ timeout: 10_000 });

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
    resetLockout("admin");
    flushRateLimits();
  });

  test.beforeEach(() => {
    flushRateLimits();
  });

  test("token is stored in localStorage after login", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder(ID_FIELD).fill("admin");
    await page.getByPlaceholder(PW_FIELD).fill(ADMIN_PW);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/chat", { timeout: 10_000 });

    const token = await page.evaluate(() =>
      localStorage.getItem("workstation_token")
    );
    expect(token).toBeTruthy();
    // JWT format: header.payload.signature
    expect(token!.split(".")).toHaveLength(3);
  });
});
