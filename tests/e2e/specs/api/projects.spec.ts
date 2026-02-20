import { test, expect, APIRequestContext } from "@playwright/test";
import { resetLockout, flushRateLimits } from "../../helpers/db";

const BASE = process.env.API_BASE_URL ?? process.env.BASE_URL ?? "http://localhost";
import { ADMIN_ID, ADMIN_PW } from "../../helpers/credentials";

let api: APIRequestContext;
let anonApi: APIRequestContext;
let adminToken: string;
let testProjectId: string;

test.beforeAll(async ({ playwright }) => {
  resetLockout(ADMIN_ID);
  flushRateLimits();

  // Use a temporary context just for login, then create the real context with Bearer header only
  const loginCtx = await playwright.request.newContext({ baseURL: BASE });
  const res = await loginCtx.post("/api/auth/login", {
    data: { identifier: ADMIN_ID, password: ADMIN_PW },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  adminToken = body.access_token;
  await loginCtx.dispose();

  // Create API context with Bearer auth in default headers (no cookies)
  api = await playwright.request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  });

  // Separate anonymous context for 401 tests (no cookies, no auth)
  anonApi = await playwright.request.newContext({ baseURL: BASE });
});

test.afterAll(async () => {
  // Clean up test project
  if (testProjectId) {
    await api.delete(`/api/projects/${testProjectId}`);
  }
  await api.dispose();
  await anonApi.dispose();
});

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

test.describe("Projects CRUD", () => {
  test("POST /api/projects creates a project", async () => {
    const res = await api.post("/api/projects", {
      data: { name: "e2e_test_project", path: "e2e_test_project" },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("e2e_test_project");
    testProjectId = body.id;
  });

  test("GET /api/projects lists projects", async () => {
    const res = await api.get("/api/projects");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("projects");
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.length).toBeGreaterThan(0);
  });

  test("PUT /api/projects/:id updates a project", async () => {
    const res = await api.put(`/api/projects/${testProjectId}`, {
      data: { name: "e2e_updated_project" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("e2e_updated_project");
  });

  test("returns 401 without auth", async () => {
    const res = await anonApi.get("/api/projects");
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Chat multi-chat support
// ---------------------------------------------------------------------------

test.describe("Multi-chat support", () => {
  let chatId1: string;
  let chatId2: string;

  test("POST /api/context/chats creates a chat for project", async () => {
    const res = await api.post("/api/context/chats", {
      data: { project_id: testProjectId, title: "E2E Chat 1" },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.title).toBe("E2E Chat 1");
    chatId1 = body.id;
  });

  test("can create a second chat for same project", async () => {
    const res = await api.post("/api/context/chats", {
      data: { project_id: testProjectId, title: "E2E Chat 2" },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.title).toBe("E2E Chat 2");
    chatId2 = body.id;
    expect(chatId2).not.toBe(chatId1);
  });

  test("GET /api/context/project/:id/chats lists project chats", async () => {
    const res = await api.get(`/api/context/project/${testProjectId}/chats`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("chats");
    expect(body.chats.length).toBeGreaterThanOrEqual(2);

    const titles = body.chats.map((c: { title: string }) => c.title);
    expect(titles).toContain("E2E Chat 1");
    expect(titles).toContain("E2E Chat 2");
  });

  test("GET /api/context/conversations/:id returns chat state", async () => {
    const res = await api.get(`/api/context/conversations/${chatId1}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.chat_id).toBe(chatId1);
    expect(body).toHaveProperty("messages");
    expect(body).toHaveProperty("current_token_count");
  });

  test("PUT /api/context/chats/:id updates chat title", async () => {
    const res = await api.put(`/api/context/chats/${chatId1}`, {
      data: { title: "E2E Chat 1 Updated" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.title).toBe("E2E Chat 1 Updated");
  });

  test("DELETE /api/context/chats/:id deletes a chat", async () => {
    const res = await api.delete(`/api/context/chats/${chatId2}`);
    expect(res.status()).toBe(204);
  });

  test("deleted chat returns 404", async () => {
    const res = await api.get(`/api/context/conversations/${chatId2}`);
    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Default chat creation
// ---------------------------------------------------------------------------

test.describe("Default chat", () => {
  test("POST /api/context/project/:id/default-chat creates or returns default", async () => {
    const res = await api.post(
      `/api/context/project/${testProjectId}/default-chat`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("chat_id");
    expect(body).toHaveProperty("conversation");
    expect(body.conversation.project_id).toBe(testProjectId);
  });

  test("calling default-chat twice returns same chat", async () => {
    const res1 = await api.post(
      `/api/context/project/${testProjectId}/default-chat`
    );
    const res2 = await api.post(
      `/api/context/project/${testProjectId}/default-chat`
    );

    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.chat_id).toBe(body2.chat_id);
  });
});

// ---------------------------------------------------------------------------
// Knowledge Base API
// ---------------------------------------------------------------------------

test.describe("Knowledge Base API", () => {
  test("GET /api/kb/sources/:projectId returns sources list", async () => {
    const res = await api.get(`/api/kb/sources/${testProjectId}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("sources");
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body).toHaveProperty("count");
    expect(typeof body.count).toBe("number");
  });

  test("POST /api/kb/search returns search results or service unavailable", async () => {
    const res = await api.post("/api/kb/search", {
      data: {
        project_id: testProjectId,
        query: "test query",
        top_k: 3,
      },
    });
    // 200 if embedding service is available, 422/500/503 if not
    expect([200, 422, 500, 503]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("results");
      expect(body).toHaveProperty("query", "test query");
      expect(body).toHaveProperty("count");
    }
  });

  test("returns 401 without auth", async () => {
    const res = await anonApi.get(`/api/kb/sources/${testProjectId}`);
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Snapshots API
// ---------------------------------------------------------------------------

test.describe("Snapshots API", () => {
  test("GET /api/projects/:id/snapshots returns snapshot list or service unavailable", async () => {
    const res = await api.get(
      `/api/projects/${testProjectId}/snapshots`
    );
    // 200 if sandbox manager is available, 422/500/503 if not
    expect([200, 422, 500, 503]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("project_id");
      expect(body).toHaveProperty("snapshots");
      expect(Array.isArray(body.snapshots)).toBe(true);
    }
  });

  test("returns 401 without auth", async () => {
    const res = await anonApi.get(`/api/projects/${testProjectId}/snapshots`);
    expect(res.status()).toBe(401);
  });
});
