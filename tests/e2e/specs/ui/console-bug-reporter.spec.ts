import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/**
 * Console Bug Reporter E2E Tests
 *
 * Verifies the ConsoleBugReporterProvider correctly:
 * 1. Creates app-level issues from console.error calls
 * 2. Creates app-level issues from console.warn calls
 * 3. Captures unhandled errors via window.onerror
 * 4. Does NOT create issues when unauthenticated
 * 5. Issue description contains metadata
 * 6. Console output is preserved (chaining)
 * 7. Multiple distinct errors create separate issues
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost";
const BATCH_DELAY_MS = 2500; // slightly longer than the 2s batch window

// ---- Helpers ----

async function apiLogin(request: APIRequestContext): Promise<string> {
  const identifier = process.env.ADMIN_ID;
  const password = process.env.ADMIN_PW;
  if (!identifier || !password) {
    throw new Error("ADMIN_ID and ADMIN_PW environment variables are required");
  }
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { identifier, password },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  return body.access_token;
}

async function listAutoIssues(
  request: APIRequestContext,
  token: string,
): Promise<{ id: string; title: string; severity: string; description: string }[]> {
  const res = await request.get(`${BASE_URL}/api/issues`, {
    params: { is_app_issue: "true", limit: "100" },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  const items = body.issues ?? body.items ?? body;
  if (!Array.isArray(items)) return [];
  return (items as { id: string; title: string; severity: string; description: string }[]).filter(
    (i) => i.title.startsWith("[Auto]"),
  );
}

async function cleanupAutoIssues(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const issues = await listAutoIssues(request, token);
  for (const issue of issues) {
    await request.delete(`${BASE_URL}/api/issues/${issue.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

// ---- Tests ----

test.describe("Console Bug Reporter", () => {
  test.setTimeout(60_000);

  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
    await cleanupAutoIssues(request, token);
  });

  test.afterAll(async ({ request }) => {
    try {
      const t = await apiLogin(request);
      await cleanupAutoIssues(request, t);
    } catch {
      // best-effort cleanup
    }
  });

  // -----------------------------------------------------------------------
  // 1. console.error creates an app-level issue
  // -----------------------------------------------------------------------
  test("console.error creates an app-level issue", async ({ page, request }) => {
    await loginAsAdmin(page, "/chat");
    await page.waitForTimeout(1000);

    const unique = `e2e-test-error-${Date.now()}`;
    await page.evaluate((msg) => console.error(msg), unique);

    await page.waitForTimeout(BATCH_DELAY_MS);

    const issues = await listAutoIssues(request, token);
    const match = issues.find((i) => i.title.includes(unique));
    expect(match).toBeTruthy();
    expect(match!.severity).toBe("medium");
    expect(match!.title).toContain("[Auto] error:");
  });

  // -----------------------------------------------------------------------
  // 2. console.warn creates an app-level issue
  // -----------------------------------------------------------------------
  test("console.warn creates an app-level issue", async ({ page, request }) => {
    await loginAsAdmin(page, "/chat");
    await cleanupAutoIssues(request, token);
    await page.waitForTimeout(1000);

    const unique = `e2e-warn-test-${Date.now()}`;
    await page.evaluate((msg) => console.warn(msg), unique);

    await page.waitForTimeout(BATCH_DELAY_MS);

    const issues = await listAutoIssues(request, token);
    const match = issues.find((i) => i.title.includes(unique));
    expect(match).toBeTruthy();
    expect(match!.severity).toBe("low");
    expect(match!.title).toContain("[Auto] warn:");
  });

  // -----------------------------------------------------------------------
  // 3. Unhandled errors (window.onerror) create issues
  // -----------------------------------------------------------------------
  test("unhandled errors create issues via window.onerror", async ({ page, request }) => {
    await loginAsAdmin(page, "/chat");
    await cleanupAutoIssues(request, token);
    await page.waitForTimeout(1000);

    const unique = `e2e-unhandled-${Date.now()}`;

    page.on("pageerror", () => {});
    await page.evaluate((msg) => {
      setTimeout(() => {
        throw new Error(msg);
      }, 0);
    }, unique);

    await page.waitForTimeout(BATCH_DELAY_MS);

    const issues = await listAutoIssues(request, token);
    const match = issues.find((i) => i.title.includes(unique));
    expect(match).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4. No issues created when unauthenticated
  // -----------------------------------------------------------------------
  test("no issues created when unauthenticated", async ({ page, request }) => {
    await cleanupAutoIssues(request, token);

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    const unique = `e2e-unauth-${Date.now()}`;
    await page.evaluate((msg) => console.error(msg), unique);

    await page.waitForTimeout(BATCH_DELAY_MS);

    const issues = await listAutoIssues(request, token);
    const match = issues.find((i) => i.title.includes(unique));
    expect(match).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 5. Issue description contains expected metadata
  // -----------------------------------------------------------------------
  test("issue description contains URL, level, and error text", async ({ page, request }) => {
    await loginAsAdmin(page, "/chat");
    await cleanupAutoIssues(request, token);
    await page.waitForTimeout(1000);

    const unique = `e2e-metadata-${Date.now()}`;
    await page.evaluate((msg) => console.error(msg), unique);

    await page.waitForTimeout(BATCH_DELAY_MS);

    const issues = await listAutoIssues(request, token);
    const match = issues.find((i) => i.title.includes(unique));
    expect(match).toBeTruthy();
    expect(match!.description).toContain("**Level:** error");
    expect(match!.description).toContain("**URL:**");
    expect(match!.description).toContain("**Time:**");
    expect(match!.description).toContain(unique);
  });

  // -----------------------------------------------------------------------
  // 6. Console output is preserved (chaining works)
  // -----------------------------------------------------------------------
  test("console.error output is still visible in DevTools", async ({ page }) => {
    await loginAsAdmin(page, "/chat");
    await page.waitForTimeout(1000);

    const unique = `e2e-chain-${Date.now()}`;
    const consoleMessages: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleMessages.push(msg.text());
      }
    });

    await page.evaluate((msg) => console.error(msg), unique);
    await page.waitForTimeout(500);

    expect(consoleMessages.some((m) => m.includes(unique))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 7. Multiple distinct errors each create separate issues
  // -----------------------------------------------------------------------
  test("multiple distinct errors create separate issues", async ({ page, request }) => {
    await loginAsAdmin(page, "/chat");
    await cleanupAutoIssues(request, token);
    await page.waitForTimeout(1000);

    const ts = Date.now();
    const errors = [
      `e2e-multi-A-${ts}`,
      `e2e-multi-B-${ts}`,
      `e2e-multi-C-${ts}`,
    ];

    await page.evaluate((msgs) => {
      for (const m of msgs) console.error(m);
    }, errors);

    await page.waitForTimeout(BATCH_DELAY_MS);

    const issues = await listAutoIssues(request, token);
    for (const err of errors) {
      const match = issues.find((i) => i.title.includes(err));
      expect(match, `expected issue for "${err}"`).toBeTruthy();
    }
  });
});
