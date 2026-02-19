import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { resetLockout, flushRateLimits } from "../../helpers/db";
import { ADMIN_ID } from "../../helpers/credentials";

/** Shared token set in beforeEach from loginAsAdmin. */
let token: string;

/** Bearer auth header for direct API calls. */
function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

test.describe("Claude Code Chat", () => {
  test.beforeAll(() => {
    flushRateLimits();
    resetLockout(ADMIN_ID);
  });

  test.beforeEach(async ({ page }) => {
    flushRateLimits();
    resetLockout(ADMIN_ID);
    token = await loginAsAdmin(page, "/chat");

    // Clear all claude code messages before each test
    await page.request.delete("/api/claude-code", {
      headers: authHeaders(),
    });
  });

  test("opens panel from header button and closes on Escape", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /claude code/i });
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    const panel = page.getByRole("dialog", { name: /claude code/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText("Claude Code").first()).toBeVisible();
    await expect(panel.getByPlaceholder(/describe the bug/i)).toBeVisible();

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });

  test("opens and closes with keyboard shortcut", async ({ page }) => {
    await page.keyboard.press("Control+Shift+KeyC");

    const panel = page.getByRole("dialog", { name: /claude code/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });

  test("sends a message and it appears in the chat", async ({ page }) => {
    await page.getByRole("button", { name: /claude code/i }).click();
    const panel = page.getByRole("dialog", { name: /claude code/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    const textarea = panel.getByPlaceholder(/describe the bug/i);
    await textarea.fill("Test bug report from Playwright");

    // Click send button
    await panel.locator("button").filter({ has: page.locator(".lucide-send") }).click();

    // Message bubble should appear (not in textarea)
    const bubble = panel.locator(".whitespace-pre-wrap", {
      hasText: "Test bug report from Playwright",
    });
    await expect(bubble).toBeVisible({ timeout: 5_000 });

    // Textarea should be cleared
    await expect(textarea).toHaveValue("");
  });

  test("sends message with page URL attached", async ({ page }) => {
    await page.getByRole("button", { name: /claude code/i }).click();
    const panel = page.getByRole("dialog", { name: /claude code/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Attach URL
    await panel.getByRole("button", { name: /page url/i }).click();

    await panel.getByPlaceholder(/describe the bug/i).fill("URL test");
    await panel.locator("button").filter({ has: page.locator(".lucide-send") }).click();

    // The message bubble should contain both the text and Page URL
    const bubble = panel.locator(".whitespace-pre-wrap").filter({ hasText: "Page URL:" });
    await expect(bubble.first()).toBeVisible({ timeout: 5_000 });
  });

  test("assistant responses appear via API polling", async ({ page }) => {
    // Open panel and send a user message
    await page.getByRole("button", { name: /claude code/i }).click();
    const panel = page.getByRole("dialog", { name: /claude code/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    await panel.getByPlaceholder(/describe the bug/i).fill("Bug: sidebar broken");
    await panel.locator("button").filter({ has: page.locator(".lucide-send") }).click();

    const userBubble = panel.locator(".whitespace-pre-wrap", {
      hasText: "Bug: sidebar broken",
    });
    await expect(userBubble).toBeVisible({ timeout: 5_000 });

    // Inject assistant response via API with Bearer auth
    flushRateLimits();
    const postRes = await page.request.post("/api/claude-code", {
      headers: authHeaders(),
      data: {
        content: "Looking into the sidebar issue now.",
        role: "assistant",
      },
    });
    expect(postRes.status()).toBe(201);

    // Wait for polling to pick it up (polls every 3s)
    const assistantBubble = panel.locator(".whitespace-pre-wrap", {
      hasText: "Looking into the sidebar issue now.",
    });
    await expect(assistantBubble).toBeVisible({ timeout: 10_000 });
  });

  test("clear button removes all messages", async ({ page }) => {
    // Seed a message via API
    flushRateLimits();
    const postRes = await page.request.post("/api/claude-code", {
      headers: authHeaders(),
      data: { content: "Message to be cleared", role: "user" },
    });
    expect(postRes.status()).toBe(201);

    await page.getByRole("button", { name: /claude code/i }).click();
    const panel = page.getByRole("dialog", { name: /claude code/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Wait for the message to load via polling
    await expect(
      panel.locator(".whitespace-pre-wrap", { hasText: "Message to be cleared" }),
    ).toBeVisible({ timeout: 10_000 });

    // Click trash/clear button in panel header
    await panel.getByTitle("Clear chat").click();

    // Empty state should appear
    await expect(panel.getByText("Send a message to Claude Code")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("messages persist across panel close/reopen", async ({ page }) => {
    // Open, send, close
    await page.getByRole("button", { name: /claude code/i }).click();
    const panel = page.getByRole("dialog", { name: /claude code/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    await panel.getByPlaceholder(/describe the bug/i).fill("Persistent message");
    await panel.locator("button").filter({ has: page.locator(".lucide-send") }).click();

    await expect(
      panel.locator(".whitespace-pre-wrap", { hasText: "Persistent message" }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Close
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible({ timeout: 3_000 });

    // Reopen - message should still be there from API
    await page.getByRole("button", { name: /claude code/i }).click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
    await expect(
      panel.locator(".whitespace-pre-wrap", { hasText: "Persistent message" }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
