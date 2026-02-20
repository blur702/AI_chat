import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits, resetLockout } from "../../helpers/db";
import { ADMIN_ID } from "../../helpers/credentials";

test.describe("Notes — App Bugs export", () => {
  test.beforeEach(async () => {
    flushRateLimits();
    resetLockout(ADMIN_ID);
  });

  test("create App Bugs note and export to markdown", async ({ page, context }) => {
    test.setTimeout(60_000);

    // Grant clipboard permissions for the context
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Collect console errors (ignore known 401 from initial auth check)
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("401")) {
        consoleErrors.push(msg.text());
      }
    });

    await loginAsAdmin(page, "/chat");
    await page.waitForLoadState("networkidle");

    // Open Notes modal via the header button
    const notesBtn = page.getByRole("button", { name: /Notes \(Ctrl\+Shift\+N\)/i });
    await expect(notesBtn).toBeVisible({ timeout: 10_000 });
    await notesBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // --- API verification: categories seeded correctly ---
    const categoriesRes = await page.request.get("/api/note-categories");
    if (!categoriesRes.ok()) {
      throw new Error(`Categories fetch failed (${categoriesRes.status()}): ${await categoriesRes.text()}`);
    }
    const categoriesData = await categoriesRes.json();
    const appBugsCat = categoriesData.categories.find(
      (c: { slug: string }) => c.slug === "app-bugs",
    );
    expect(appBugsCat).toBeTruthy();
    expect(appBugsCat.color).toBe("#f97316"); // orange

    // Also verify Errors category still exists
    const errorsCat = categoriesData.categories.find(
      (c: { slug: string }) => c.slug === "errors",
    );
    expect(errorsCat).toBeTruthy();

    // --- Create a test bug note ---
    const baseUrl = page.url().split("/chat")[0];
    if (!baseUrl) {
      throw new Error("Could not determine base URL from current page");
    }
    const noteRes = await page.request.post("/api/notes", {
      headers: { Origin: baseUrl },
      data: {
        title: "Test Bug: Export button broken",
        body: "The export button does not download the file correctly in Edge.",
        category_id: appBugsCat.id,
      },
    });
    if (!noteRes.ok()) {
      throw new Error(`Note creation failed (${noteRes.status()}): ${await noteRes.text()}`);
    }
    const createdNote = await noteRes.json();

    // --- Test the export API endpoint ---
    const exportRes = await page.request.get("/api/notes/export/app-bugs");
    expect(exportRes.ok()).toBeTruthy();
    const exportData = await exportRes.json();
    expect(exportData.count).toBeGreaterThanOrEqual(1);
    expect(exportData.markdown).toContain("# App Bugs to Fix");
    expect(exportData.markdown).toContain("Test Bug: Export button broken");
    expect(exportData.markdown).toContain("Codebase root:");
    expect(exportData.markdown).toContain("bug(s) reported in the AICHAT workstation app");

    // --- Test the UI export button ---
    // Close and reopen to refresh state with the new note
    await dialog.getByRole("button", { name: /close notes/i }).click();
    await expect(dialog).not.toBeVisible();

    await notesBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Find and click the export button
    const exportButton = page.getByRole("dialog").getByRole("button", {
      name: /export app bugs/i,
    });
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    // Verify the checkmark feedback appears (button shows green check for 2s)
    const checkIcon = page.getByRole("dialog").locator("svg.text-green-500");
    await expect(checkIcon).toBeVisible({ timeout: 3_000 });

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("# App Bugs to Fix");
    expect(clipboardText).toContain("Test Bug: Export button broken");

    // Clean up: delete the test note
    const deleteRes = await page.request.delete(`/api/notes/${createdNote.id}`, {
      headers: { Origin: baseUrl },
    });
    if (!deleteRes.ok()) {
      console.warn(`Test cleanup: failed to delete note ${createdNote.id}`);
    }

    // Report console errors
    if (consoleErrors.length > 0) {
      console.warn("Console errors during test:", consoleErrors);
    }
  });
});
