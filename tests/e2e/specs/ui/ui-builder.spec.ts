import { test, expect, Page } from "@playwright/test";
import { ADMIN_ID, ADMIN_PW } from "../../helpers/credentials";
import { resetLockout, flushRateLimits } from "../../helpers/db";

let page: Page;

test.beforeAll(async ({ browser }) => {
  resetLockout(ADMIN_ID);
  flushRateLimits();

  const context = await browser.newContext();
  page = await context.newPage();

  // Login via API to set auth cookie
  const res = await page.request.post("/api/auth/login", {
    data: { identifier: ADMIN_ID, password: ADMIN_PW },
  });
  if (res.status() !== 200) {
    throw new Error(`Login failed: ${res.status()}`);
  }

  await page.goto("/chat");
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await page.close();
});

// ---------------------------------------------------------------------------
// UI Builder panel
// ---------------------------------------------------------------------------

test.describe("UI Builder panel", () => {
  test.skip(true, "Requires a project with workspace open — run manually");

  test("UI Builder button exists in workspace toolbar", async () => {
    // Navigate to a workspace (assumes at least one project exists)
    const builderBtn = page.getByRole("button", { name: /UI Builder/i });
    await expect(builderBtn).toBeVisible();
  });

  test("clicking UI Builder opens the sheet panel", async () => {
    await page.getByRole("button", { name: /UI Builder/i }).click();
    // Sheet should appear with the UI Builder title
    const heading = page.getByRole("heading", { name: /UI Builder/i });
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("component palette shows categories", async () => {
    // Should show category filter buttons
    const allBtn = page.getByRole("button", { name: /All/i }).first();
    await expect(allBtn).toBeVisible();
  });

  test("search filters components", async () => {
    const searchInput = page.getByPlaceholder("Search components...");
    await expect(searchInput).toBeVisible();

    await searchInput.fill("button");
    // Should show at least one result containing "button"
    const results = page.locator("text=Button").first();
    await expect(results).toBeVisible({ timeout: 3000 });

    // Clear search
    await searchInput.fill("");
  });

  test("clicking a component adds it to the tree", async () => {
    // Click first component in the list
    const firstComponent = page
      .locator('[draggable="true"]')
      .first();
    const countBefore = await page.locator('[data-testid="tree-item"]').count();
    await firstComponent.click();

    // Component tree should show at least one item and count should increase
    const treeItem = page.locator("text=Component Tree").first();
    await expect(treeItem).toBeVisible();
    const countAfter = await page.locator('[data-testid="tree-item"]').count();
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test("selecting a component shows properties editor", async () => {
    // Properties editor should appear for the selected component
    const editPropsText = page.locator("text=Edit properties").first();
    await expect(editPropsText).toBeVisible({ timeout: 3000 });
  });

  test("code preview toggle works", async () => {
    // Toggle to code view
    const codeBtn = page.getByRole("button", { name: /Show code/i });
    await codeBtn.click();

    // Should show generated HTML
    const generatedLabel = page.locator("text=Generated HTML");
    await expect(generatedLabel).toBeVisible();

    // Toggle back
    const paletteBtn = page.getByRole("button", { name: /Show palette/i });
    await paletteBtn.click();
  });

  test("clear all removes components from tree", async () => {
    const clearBtn = page.getByRole("button", { name: /Clear all/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      // Tree should be empty — no tree items remain
      const emptyMsg = page.locator("text=Click a component to add it");
      await expect(emptyMsg).toBeVisible({ timeout: 3000 });
      const remainingItems = await page.locator('[data-testid="tree-item"]').count();
      expect(remainingItems).toBe(0);
    }
  });

  test("close button dismisses the panel", async () => {
    const closeBtn = page.getByRole("button", { name: /Close UI Builder/i });
    await closeBtn.click();

    // Panel should no longer be visible
    const heading = page.getByRole("heading", { name: /UI Builder/i });
    await expect(heading).not.toBeVisible({ timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Preview pane viewport toggles
// ---------------------------------------------------------------------------

test.describe("Preview pane viewport toggles", () => {
  test.skip(true, "Requires a project with workspace open — run manually");

  test("viewport toggle buttons are visible", async () => {
    // Mobile viewport button
    const mobileBtn = page.getByRole("button", { name: /Mobile viewport/i });
    await expect(mobileBtn).toBeVisible();

    // Tablet viewport button
    const tabletBtn = page.getByRole("button", { name: /Tablet viewport/i });
    await expect(tabletBtn).toBeVisible();

    // Desktop viewport button
    const desktopBtn = page.getByRole("button", { name: /Desktop viewport/i });
    await expect(desktopBtn).toBeVisible();
  });

  test("clicking mobile viewport constrains iframe width", async () => {
    await page.getByRole("button", { name: /Mobile viewport/i }).click();

    // Should show viewport label
    const label = page.locator("text=Mobile (375px)");
    await expect(label).toBeVisible();
  });

  test("clicking tablet viewport constrains iframe width", async () => {
    await page.getByRole("button", { name: /Tablet viewport/i }).click();

    const label = page.locator("text=Tablet (768px)");
    await expect(label).toBeVisible();
  });

  test("clicking desktop viewport constrains iframe width", async () => {
    await page.getByRole("button", { name: /Desktop viewport/i }).click();

    const label = page.locator("text=Desktop (1280px)");
    await expect(label).toBeVisible();
  });

  test("auto viewport removes constraint", async () => {
    await page.getByRole("button", { name: /Auto width/i }).click();

    // No viewport label should be shown
    const mobileLabel = page.locator("text=Mobile (375px)");
    const tabletLabel = page.locator("text=Tablet (768px)");
    const desktopLabel = page.locator("text=Desktop (1280px)");
    await expect(mobileLabel).not.toBeVisible();
    await expect(tabletLabel).not.toBeVisible();
    await expect(desktopLabel).not.toBeVisible();
  });

  test("edit mode toggle switches mode", async () => {
    // Default should be View Mode
    const viewBtn = page.getByRole("button", { name: /View Mode/i });
    await expect(viewBtn).toBeVisible();

    // Toggle to edit mode
    await viewBtn.click();
    const editBtn = page.getByRole("button", { name: /Edit Mode/i });
    await expect(editBtn).toBeVisible();

    // Toggle back
    await editBtn.click();
    await expect(viewBtn).toBeVisible();
  });
});
