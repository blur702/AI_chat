import type { Page } from "@playwright/test";
import { resetLockout, flushRateLimits } from "./db";
import { ADMIN_ID, ADMIN_PW } from "./credentials";

/**
 * Login as admin via API and navigate to a page. Uses cookie-based auth
 * to avoid the redirect loop caused by AuthProvider's getCurrentUser() 401
 * handler on the login page.
 */
export async function loginAsAdmin(page: Page, redirectTo = "/chat") {
  resetLockout(ADMIN_ID);
  flushRateLimits();

  // Clear any existing cookies/state
  await page.context().clearCookies();

  // Login via API — sets the HttpOnly auth cookie in the browser context
  const res = await page.request.post("/api/auth/login", {
    data: { identifier: ADMIN_ID, password: ADMIN_PW },
  });
  if (res.status() !== 200) {
    throw new Error(`loginAsAdmin API login failed: ${res.status()}`);
  }

  // Navigate to target page
  await page.goto(redirectTo);
  await page.waitForLoadState("domcontentloaded");
}
