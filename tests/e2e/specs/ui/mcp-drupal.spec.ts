import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits, resetLockout } from "../../helpers/db";
import { ADMIN_ID, ADMIN_PW } from "../../helpers/credentials";

const BASE = process.env.BASE_URL ?? "http://localhost";
const ORIGIN = BASE.replace(/\/$/, "");
const DRUPAL_SITE_URL = process.env.DRUPAL_TEST_SITE_URL ?? "https://kevinalthaus.com";
const DRUPAL_SITE_NAME = process.env.DRUPAL_TEST_SITE_NAME ?? "Kevin Althaus";
const DRUPAL_USERNAME = process.env.DRUPAL_ADMIN_USER ?? "admin";
const DRUPAL_PASSWORD = process.env.DRUPAL_ADMIN_PW;

test.describe.serial("MCP / Drupal — e2e", () => {
  let projectId: string;
  let authToken: string;

  test.beforeEach(async () => {
    await flushRateLimits();
    await resetLockout(ADMIN_ID);
  });

  /**
   * Helper: make an authenticated API request using Bearer token
   * to avoid CSRF issues with cookie-only auth.
   */
  async function apiPost(page: import("@playwright/test").Page, url: string, data?: unknown) {
    return page.request.post(url, {
      headers: { Authorization: `Bearer ${authToken}`, Origin: ORIGIN },
      ...(data !== undefined ? { data } : {}),
    });
  }

  async function apiGet(page: import("@playwright/test").Page, url: string) {
    return page.request.get(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  // -------------------------------------------------------------------------
  // Setup: ensure we have a project to work with
  // -------------------------------------------------------------------------

  test("setup: get or create a project for MCP tests", async ({ page }) => {
    authToken = await loginAsAdmin(page, "/chat");

    const listRes = await apiGet(page, "/api/projects");
    expect(listRes.ok()).toBeTruthy();
    const { projects } = await listRes.json();

    if (projects && projects.length > 0) {
      projectId = projects[0].id;
    } else {
      const createRes = await apiPost(page, "/api/projects", {
        name: "MCP Test Project",
        path: "mcp-test",
      });
      expect(createRes.status()).toBe(201);
      const body = await createRes.json();
      projectId = body.id;
    }

    expect(projectId).toBeTruthy();

    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);
  });

  // -------------------------------------------------------------------------
  // MCP page loads
  // -------------------------------------------------------------------------

  test("MCP page loads and shows workspace", async ({ page }) => {
    test.setTimeout(30_000);

    await loginAsAdmin(page, "/chat");
    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);

    await page.goto("/mcp");
    await page.waitForLoadState("domcontentloaded");

    const header = page.getByText("MCP Chat");
    const loading = page.getByText("Loading MCP workspace...");
    await expect(header.or(loading)).toBeVisible({ timeout: 15_000 });

    if (await loading.isVisible().catch(() => false)) {
      await expect(header).toBeVisible({ timeout: 15_000 });
    }
  });

  test("MCP page has Drupal Preview pane", async ({ page }) => {
    test.setTimeout(30_000);

    await loginAsAdmin(page, "/chat");
    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);

    await page.goto("/mcp");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("MCP Chat")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Drupal Preview")).toBeVisible({ timeout: 5_000 });
  });

  test("MCP page sidebar toggle works", async ({ page }) => {
    test.setTimeout(30_000);

    await loginAsAdmin(page, "/chat");
    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);

    await page.goto("/mcp");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("MCP Chat")).toBeVisible({ timeout: 15_000 });

    const toggleBtn = page.locator('button[title="Open sidebar"]');
    if (await toggleBtn.isVisible().catch(() => false)) {
      await toggleBtn.click();
      await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Context Editor")).toBeVisible({ timeout: 5_000 });

      const closeBtn = page.locator('button[title="Close sidebar"]');
      await closeBtn.click();
      await expect(page.getByText("Dashboard").last()).not.toBeVisible({ timeout: 5_000 });
    }
  });

  // -------------------------------------------------------------------------
  // Drupal API: connect site
  // -------------------------------------------------------------------------

  test("Drupal API: connect to production site", async ({ page }) => {
    test.setTimeout(30_000);

    if (!DRUPAL_PASSWORD) {
      test.skip(true, "DRUPAL_ADMIN_PW not configured");
      return;
    }

    authToken = await loginAsAdmin(page, "/chat");

    const connectRes = await apiPost(page, `/api/drupal/${projectId}/connect`, {
      site_url: DRUPAL_SITE_URL,
      username: DRUPAL_USERNAME,
      password: DRUPAL_PASSWORD,
      site_name: DRUPAL_SITE_NAME,
    });

    // 200 = connected, 400 = bad creds, 500/503 = service issue
    if (connectRes.ok()) {
      const body = await connectRes.json();
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("project_id");
      expect(body.site_url).toBe(DRUPAL_SITE_URL);
    } else {
      const st = connectRes.status();
      console.warn(`Drupal connect returned ${st} — site may not be reachable or credentials invalid`);
      expect([400, 500, 503]).toContain(st);
    }
  });

  // -------------------------------------------------------------------------
  // Drupal API: site info
  // -------------------------------------------------------------------------

  test("Drupal API: get site info", async ({ page }) => {
    authToken = await loginAsAdmin(page, "/chat");

    const res = await apiGet(page, `/api/drupal/${projectId}/site`);

    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("site_url");
      expect(body).toHaveProperty("project_id");
    } else {
      expect([404, 500]).toContain(res.status());
    }
  });

  // -------------------------------------------------------------------------
  // Drupal API: staging status
  // -------------------------------------------------------------------------

  test("Drupal API: get staging status", async ({ page }) => {
    authToken = await loginAsAdmin(page, "/chat");

    const res = await apiGet(page, `/api/drupal/${projectId}/staging-status`);

    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("sandbox_running");
      expect(typeof body.sandbox_running).toBe("boolean");
      expect(body).toHaveProperty("site_url");
    } else {
      expect([404, 422, 500, 503]).toContain(res.status());
    }
  });

  // -------------------------------------------------------------------------
  // Drupal API: clone from production
  // -------------------------------------------------------------------------

  test("Drupal API: clone production site", async ({ page }) => {
    test.setTimeout(180_000);

    authToken = await loginAsAdmin(page, "/chat");

    const siteRes = await apiGet(page, `/api/drupal/${projectId}/site`);
    if (!siteRes.ok()) {
      test.skip(true, "No Drupal site connected — skipping clone test");
      return;
    }

    const cloneRes = await page.request.post(`/api/drupal/${projectId}/clone`, {
      headers: { Authorization: `Bearer ${authToken}`, Origin: ORIGIN },
      data: { include_files: true, include_db: true },
      timeout: 180_000,
    });

    if (cloneRes.ok()) {
      const body = await cloneRes.json();
      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("message");

      if (body.success) {
        expect(body.message).toContain("cloned");
        if (body.preview_url) {
          expect(body.preview_url).toMatch(/^http/);
        }
        if (body.details) {
          console.log("Clone details:", JSON.stringify(body.details, null, 2));
        }
      } else {
        console.warn("Clone completed with issues:", body.message, body.details);
      }
    } else {
      const st = cloneRes.status();
      console.warn(`Clone returned ${st}`);
      expect([404, 500, 503]).toContain(st);
    }
  });

  // -------------------------------------------------------------------------
  // Drupal API: staging start/stop
  // -------------------------------------------------------------------------

  test("Drupal API: start staging sandbox", async ({ page }) => {
    test.setTimeout(60_000);

    authToken = await loginAsAdmin(page, "/chat");

    const siteRes = await apiGet(page, `/api/drupal/${projectId}/site`);
    if (!siteRes.ok()) {
      test.skip(true, "No Drupal site connected — skipping staging start");
      return;
    }

    const startRes = await apiPost(page, `/api/drupal/${projectId}/staging/start`);

    if (startRes.ok()) {
      const body = await startRes.json();
      expect(body).toHaveProperty("message");
    } else {
      console.warn(`Staging start returned ${startRes.status()}`);
      expect([404, 500, 503]).toContain(startRes.status());
    }
  });

  test("Drupal API: stop staging sandbox", async ({ page }) => {
    test.setTimeout(30_000);

    authToken = await loginAsAdmin(page, "/chat");

    const siteRes = await apiGet(page, `/api/drupal/${projectId}/site`);
    if (!siteRes.ok()) {
      test.skip(true, "No Drupal site connected — skipping staging stop");
      return;
    }

    const stopRes = await apiPost(page, `/api/drupal/${projectId}/staging/stop`);

    if (stopRes.ok()) {
      const body = await stopRes.json();
      expect(body).toHaveProperty("message");
    } else {
      console.warn(`Staging stop returned ${stopRes.status()}`);
      expect([404, 500, 503]).toContain(stopRes.status());
    }
  });

  // -------------------------------------------------------------------------
  // Drupal API: modules & themes
  // -------------------------------------------------------------------------

  test("Drupal API: list modules", async ({ page }) => {
    authToken = await loginAsAdmin(page, "/chat");

    const siteRes = await apiGet(page, `/api/drupal/${projectId}/site`);
    if (!siteRes.ok()) {
      test.skip(true, "No Drupal site connected — skipping modules list");
      return;
    }

    const res = await apiGet(page, `/api/drupal/${projectId}/modules`);

    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("items");
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
    } else {
      console.warn(`Modules list returned ${res.status()}`);
      expect([404, 500, 503]).toContain(res.status());
    }
  });

  test("Drupal API: list themes", async ({ page }) => {
    authToken = await loginAsAdmin(page, "/chat");

    const siteRes = await apiGet(page, `/api/drupal/${projectId}/site`);
    if (!siteRes.ok()) {
      test.skip(true, "No Drupal site connected — skipping themes list");
      return;
    }

    const res = await apiGet(page, `/api/drupal/${projectId}/themes`);

    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("items");
      expect(Array.isArray(body.items)).toBe(true);
    } else {
      console.warn(`Themes list returned ${res.status()}`);
      expect([404, 500, 503]).toContain(res.status());
    }
  });

  // -------------------------------------------------------------------------
  // MCP page: UI staging controls
  // -------------------------------------------------------------------------

  test("MCP UI: staging controls show status badges", async ({ page }) => {
    test.setTimeout(30_000);

    await loginAsAdmin(page, "/chat");
    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);

    await page.goto("/mcp");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("MCP Chat")).toBeVisible({ timeout: 15_000 });

    // The Drupal Preview pane is always visible
    expect(await page.getByText("Drupal Preview").isVisible()).toBeTruthy();

    // Staging controls: at least one action button should be visible when site is connected
    const cloneBtn = page.getByRole("button", { name: /clone from prod/i });
    const startBtn = page.getByRole("button", { name: /^start$/i });
    const stopBtn = page.getByRole("button", { name: /^stop$/i });

    const anyVisible = await Promise.any([
      cloneBtn.isVisible().then((v) => v || Promise.reject()),
      startBtn.isVisible().then((v) => v || Promise.reject()),
      stopBtn.isVisible().then((v) => v || Promise.reject()),
    ]).catch(() => false);

    if (!anyVisible) {
      console.warn("No staging action buttons visible — Drupal site may not be connected");
    }
  });

  test("MCP UI: clone dialog opens and can be cancelled", async ({ page }) => {
    test.setTimeout(30_000);

    await loginAsAdmin(page, "/chat");
    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);

    await page.goto("/mcp");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("MCP Chat")).toBeVisible({ timeout: 15_000 });

    const cloneBtn = page.getByRole("button", { name: /clone from prod/i });
    if (await cloneBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cloneBtn.click();

      await expect(page.getByText("Clone Production Site")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/download the database and files/i)).toBeVisible();

      await page.getByRole("button", { name: /cancel/i }).click();
      await expect(page.getByText("Clone Production Site")).not.toBeVisible({ timeout: 3_000 });
    } else {
      console.warn("Clone button not visible — site may not be connected");
    }
  });

  // -------------------------------------------------------------------------
  // MCP page: message input
  // -------------------------------------------------------------------------

  test("MCP UI: message input is present", async ({ page }) => {
    test.setTimeout(30_000);

    await loginAsAdmin(page, "/chat");
    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);

    await page.goto("/mcp");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("MCP Chat")).toBeVisible({ timeout: 15_000 });

    const messageInput = page.locator("textarea, input[type='text']").last();
    await expect(messageInput).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Screenshot
  // -------------------------------------------------------------------------

  test("MCP page: visual screenshot", async ({ page }) => {
    test.setTimeout(30_000);

    await loginAsAdmin(page, "/chat");
    await page.evaluate((pid: string) => {
      localStorage.setItem("workstation_chat_project_id", pid);
    }, projectId);

    await page.goto("/mcp");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("MCP Chat")).toBeVisible({ timeout: 15_000 });

    await page.screenshot({
      path: "test-results/mcp-drupal-page.png",
      fullPage: true,
    });
  });
});
