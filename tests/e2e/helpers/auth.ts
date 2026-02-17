import type { Page } from "@playwright/test";
import { resetLockout, flushRateLimits } from "./db";

const ADMIN_PW = "Admin123!";

/**
 * Login as admin and navigate to a page. Reusable across E2E specs.
 */
export async function loginAsAdmin(page: Page, redirectTo = "/chat") {
  resetLockout("admin");
  flushRateLimits();

  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  await page.getByPlaceholder(/admin@workstation\.local/i).fill("admin");
  await page.getByPlaceholder(/enter your password/i).fill(ADMIN_PW);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL("**/chat", { timeout: 15_000 });

  if (redirectTo !== "/chat") {
    await page.goto(redirectTo);
    await page.waitForLoadState("domcontentloaded");
  }
}
