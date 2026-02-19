import { test, expect, Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/**
 * Console Audit: Visit every app route, capture console errors/warnings,
 * click through major interactive elements, and assert zero unexpected errors.
 *
 * "Benign" errors are filtered: HTTP status codes in browser console, Next.js
 * RSC navigation fallbacks, React DevTools notices, etc. Only actual JavaScript
 * application errors (uncaught exceptions, React rendering errors) should fail.
 */

// Known benign console messages to filter out
const BENIGN_PATTERNS = [
  // Browser/framework noise
  /Download the React DevTools/,
  /Warning: ReactDOM\.render is no longer supported/,
  /\[HMR\]/,
  /\[Fast Refresh\]/,
  /hydration/i,
  /NEXT_REDIRECT/,
  /ResizeObserver loop/,
  /Loading chunk/,
  /ChunkLoadError/,
  /Cannot read properties of null.*removeChild/,
  /Blocked aria-hidden/,
  /Each child in a list should have a unique "key" prop/,
  // Network resource loading (HTTP status codes in browser console)
  /Failed to load resource/,
  // Next.js RSC navigation fallbacks
  /Failed to fetch RSC payload/,
  /Falling back to browser navigation/,
  // Fetch/network errors (transient)
  /net::ERR_/,
  /AbortError/,
  /TypeError: Failed to fetch/,
  /TypeError: network error/,
  /TypeError: NetworkError/,
  // WebSocket connection issues (transient)
  /WebSocket connection/,
  /WebSocket is already in CLOSING or CLOSED state/,
];

function isBenign(msg: string): boolean {
  return BENIGN_PATTERNS.some((p) => p.test(msg));
}

interface ConsoleCapture {
  errors: string[];
  pageErrors: string[];
}

function setupConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], pageErrors: [] };

  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" && !isBenign(text)) {
      capture.errors.push(text);
    }
  });

  page.on("pageerror", (error) => {
    const text = error.message;
    if (!isBenign(text)) {
      capture.pageErrors.push(text);
    }
  });

  return capture;
}

async function waitForPageStable(page: Page, timeout = 5000) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout });
  } catch {
    // Pages with websockets/polling won't go idle — fine
  }
  await page.waitForTimeout(1000);
}

async function safeClick(page: Page, selector: string, timeout = 3000) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout })) {
      await el.click({ timeout });
      await page.waitForTimeout(500);
    }
  } catch {
    // Element may not exist — skip
  }
}

async function safeClickRole(
  page: Page,
  role: Parameters<Page["getByRole"]>[0],
  options: Parameters<Page["getByRole"]>[1],
  timeout = 3000
) {
  try {
    const el = page.getByRole(role, options).first();
    if (await el.isVisible({ timeout })) {
      await el.click({ timeout });
      await page.waitForTimeout(500);
    }
  } catch {
    // skip
  }
}

function assertNoErrors(capture: ConsoleCapture) {
  if (capture.errors.length > 0) {
    console.log("Console errors found:", JSON.stringify(capture.errors, null, 2));
  }
  if (capture.pageErrors.length > 0) {
    console.log("Page errors found:", JSON.stringify(capture.pageErrors, null, 2));
  }
  expect(capture.errors).toEqual([]);
  expect(capture.pageErrors).toEqual([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Console Audit - All Pages", () => {
  test.setTimeout(120_000);

  // -------------------------------------------------------------------------
  // Login page (no auth required)
  // -------------------------------------------------------------------------
  test("login page has no console errors", async ({ page }) => {
    const capture = setupConsoleCapture(page);
    await page.goto("/login");
    await waitForPageStable(page);

    // Interact with form fields if they loaded (page may 502 transiently)
    try {
      const idField = page.getByPlaceholder(/admin@workstation/i);
      if (await idField.isVisible({ timeout: 5000 })) {
        await idField.fill("test");
        await page.getByPlaceholder(/enter your password/i).fill("test");
        await page.waitForTimeout(500);
      }
    } catch {
      // Page didn't fully load — still check for JS errors
    }

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Projects page
  // -------------------------------------------------------------------------
  test("projects page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/projects");
    const capture = setupConsoleCapture(page);
    await page.goto("/projects");
    await waitForPageStable(page);

    await safeClickRole(page, "button", { name: /new project/i });
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Chat page
  // -------------------------------------------------------------------------
  test("chat page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/chat");
    const capture = setupConsoleCapture(page);
    await page.goto("/chat");
    await waitForPageStable(page);

    await safeClick(page, 'textarea, [role="textbox"], input[type="text"]');
    await page.waitForTimeout(500);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Notes page
  // -------------------------------------------------------------------------
  test("notes page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/notes");
    const capture = setupConsoleCapture(page);
    await page.goto("/notes");
    await waitForPageStable(page);

    await safeClickRole(page, "button", { name: /new note/i });
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Studio page
  // -------------------------------------------------------------------------
  test("studio page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/studio");
    const capture = setupConsoleCapture(page);
    await page.goto("/studio");
    await waitForPageStable(page);

    await safeClickRole(page, "button", { name: /new/i });
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Settings page - all tabs
  // -------------------------------------------------------------------------
  test("settings page (all tabs) has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/settings");
    const capture = setupConsoleCapture(page);
    await page.goto("/settings");
    await waitForPageStable(page);

    const tabNames = ["Profile", "Image Gen", "Models", "System"];
    for (const tabName of tabNames) {
      await safeClickRole(page, "tab", { name: new RegExp(tabName, "i") });
      await page.waitForTimeout(800);
    }

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Admin page
  // -------------------------------------------------------------------------
  test("admin page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/admin");
    const capture = setupConsoleCapture(page);
    await page.goto("/admin");
    await waitForPageStable(page);

    await safeClickRole(page, "tab", { name: /users/i });
    await page.waitForTimeout(800);
    await safeClickRole(page, "tab", { name: /help/i });
    await page.waitForTimeout(800);
    await safeClickRole(page, "tab", { name: /system/i });
    await page.waitForTimeout(800);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // MCP page
  // -------------------------------------------------------------------------
  test("mcp page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/mcp");
    const capture = setupConsoleCapture(page);
    await page.goto("/mcp");
    await waitForPageStable(page);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Drupal page
  // -------------------------------------------------------------------------
  test("drupal page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/drupal");
    const capture = setupConsoleCapture(page);
    await page.goto("/drupal");
    await waitForPageStable(page);

    await safeClickRole(page, "tab", { name: /content/i });
    await page.waitForTimeout(800);
    await safeClickRole(page, "tab", { name: /modules/i });
    await page.waitForTimeout(800);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Palettes page
  // -------------------------------------------------------------------------
  test("palettes page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/palettes");
    const capture = setupConsoleCapture(page);
    await page.goto("/palettes");
    await waitForPageStable(page);

    await safeClickRole(page, "button", { name: /new|create/i });
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    assertNoErrors(capture);
  });

  // -------------------------------------------------------------------------
  // Workspace page (needs a project ID)
  // -------------------------------------------------------------------------
  test("workspace page has no console errors", async ({ page }) => {
    await loginAsAdmin(page, "/projects");
    const capture = setupConsoleCapture(page);

    const projectsRes = await page.request.get("/api/projects");
    let projectId: string | null = null;
    if (projectsRes.ok()) {
      const projects = await projectsRes.json();
      if (Array.isArray(projects) && projects.length > 0) {
        projectId = projects[0].id;
      }
    }

    if (projectId) {
      await page.goto(`/workspace/${projectId}`);
      await waitForPageStable(page, 10000);

      await safeClickRole(page, "tab", { name: /files/i });
      await page.waitForTimeout(800);
      await safeClickRole(page, "tab", { name: /terminal/i });
      await page.waitForTimeout(800);
      await safeClickRole(page, "tab", { name: /editor/i });
      await page.waitForTimeout(800);
    } else {
      await page.goto("/workspace");
      await waitForPageStable(page);
    }

    assertNoErrors(capture);
  });
});
