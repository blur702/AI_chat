import { test, expect, APIRequestContext } from "@playwright/test";
import { resetLockout, flushRateLimits } from "../../helpers/db";

const BASE = process.env.API_BASE_URL ?? process.env.BASE_URL ?? "http://localhost";
import { ADMIN_ID, ADMIN_PW } from "../../helpers/credentials";

let api: APIRequestContext;
let anonApi: APIRequestContext;
let adminToken: string;

test.beforeAll(async ({ playwright }) => {
  resetLockout(ADMIN_ID);
  flushRateLimits();

  const loginCtx = await playwright.request.newContext({ baseURL: BASE });
  const res = await loginCtx.post("/api/auth/login", {
    data: { identifier: ADMIN_ID, password: ADMIN_PW },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  adminToken = body.access_token;
  await loginCtx.dispose();

  api = await playwright.request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  });

  anonApi = await playwright.request.newContext({ baseURL: BASE });
});

test.afterAll(async () => {
  await api.dispose();
  await anonApi.dispose();
});

// ---------------------------------------------------------------------------
// SSRF: Git import URL validation
// ---------------------------------------------------------------------------

test.describe("Git import SSRF protection", () => {
  test("rejects private IP git URL (127.0.0.1)", async () => {
    const res = await api.post("/api/projects/import/git", {
      data: {
        git_url: "http://127.0.0.1:8080/repo.git",
        name: "ssrf_test",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("rejects private IP git URL (10.x)", async () => {
    const res = await api.post("/api/projects/import/git", {
      data: {
        git_url: "http://10.0.0.1/repo.git",
        name: "ssrf_test",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("rejects private IP git URL (192.168.x)", async () => {
    const res = await api.post("/api/projects/import/git", {
      data: {
        git_url: "http://192.168.1.1/repo.git",
        name: "ssrf_test",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("rejects file:// protocol", async () => {
    const res = await api.post("/api/projects/import/git", {
      data: {
        git_url: "file:///etc/passwd",
        name: "ssrf_test",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("rejects ftp:// protocol", async () => {
    const res = await api.post("/api/projects/import/git", {
      data: {
        git_url: "ftp://evil.com/repo.git",
        name: "ssrf_test",
      },
    });
    expect(res.status()).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Drush command allowlist
// ---------------------------------------------------------------------------

test.describe("Drush command security", () => {
  test("rejects shell metacharacters in drush command", async () => {
    const projRes = await api.post("/api/projects", {
      data: { name: "e2e_drush_test", path: "e2e_drush_test" },
    });
    const projectId = (await projRes.json()).id;

    const res = await api.post(`/api/drupal/${projectId}/drush`, {
      data: { command: "status; rm -rf /" },
    });
    // Either 400 (blocked command) or 404 (no Drupal site)
    expect([400, 404]).toContain(res.status());

    // Cleanup
    await api.delete(`/api/projects/${projectId}`);
  });

  test("rejects disallowed drush command", async () => {
    const projRes = await api.post("/api/projects", {
      data: { name: "e2e_drush_test2", path: "e2e_drush_test2" },
    });
    const projectId = (await projRes.json()).id;

    const res = await api.post(`/api/drupal/${projectId}/drush`, {
      data: { command: "sql-dump" },
    });
    expect([400, 404]).toContain(res.status());

    await api.delete(`/api/projects/${projectId}`);
  });
});

// ---------------------------------------------------------------------------
// Content length limits
// ---------------------------------------------------------------------------

test.describe("Content length limits", () => {
  test("stream_message rejects excessively long content", async () => {
    // Create a project and chat first
    const projRes = await api.post("/api/projects", {
      data: { name: "e2e_content_test", path: "e2e_content_test" },
    });
    const projectId = (await projRes.json()).id;

    const chatRes = await api.post("/api/context/chats", {
      data: { project_id: projectId, title: "Content Test" },
    });
    const chatId = (await chatRes.json()).id;

    // Send a message longer than 100K characters
    const longContent = "a".repeat(101_000);
    const res = await api.post(
      `/api/context/conversations/${chatId}/messages/stream`,
      {
        headers: { "Content-Type": "application/json" },
        data: { content: longContent },
      }
    );
    expect(res.status()).toBe(422);

    // Cleanup
    await api.delete(`/api/projects/${projectId}`);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

test.describe("Rate limiting", () => {
  test("rate limit headers are present on responses", async () => {
    const res = await api.get("/api/projects");
    expect(res.status()).toBe(200);
    expect(res.headers()["x-ratelimit-remaining"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Auth edge cases
// ---------------------------------------------------------------------------

test.describe("Auth edge cases", () => {
  test("expired/invalid JWT returns 401", async () => {
    const res = await anonApi.get("/api/projects", {
      headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" },
    });
    expect(res.status()).toBe(401);
  });

  test("missing auth header returns 401", async () => {
    const res = await anonApi.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });
});
