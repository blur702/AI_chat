import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits } from "../../helpers/db";

test.describe("Chat flow", () => {
  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    await loginAsAdmin(page);
  });

  test("chat page shows sidebar and message area", async ({ page }) => {
    await expect(page.getByText(/new chat/i)).toBeVisible({ timeout: 10_000 });
    // Message area
    await expect(
      page.locator('[aria-label="Message input"], textarea')
    ).toBeVisible({ timeout: 10_000 });
  });

  test("can type in message input", async ({ page }) => {
    const input = page.locator('[aria-label="Message input"], textarea').first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill("Hello, AI!");
    await expect(input).toHaveValue("Hello, AI!");
  });

  test("send button appears when text is entered", async ({ page }) => {
    const input = page.locator('[aria-label="Message input"], textarea').first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill("Test message");

    const sendBtn = page.getByRole("button", { name: /send/i });
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  });

  test("sidebar shows chat list", async ({ page }) => {
    // The sidebar should be visible on desktop
    const sidebar = page.locator('[class*="sidebar"], nav').first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
  });
});
