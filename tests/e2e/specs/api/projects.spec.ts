import { test, expect, APIRequestContext } from "@playwright/test";
import { resetLockout, flushRateLimits } from "../../helpers/db";

const BASE = process.env.API_BASE_URL ?? "http://localhost";
const ADMIN_ID = "admin";
const ADMIN_PW = "Admin123!";

let api: APIRequestContext;
let adminToken: string;
let testProjectId: string;

test.beforeAll(async ({ playwright }) => {
  resetLockout("admin");
  flushRateLimits();

  api = await playwright.request.newContext({ baseURL: BASE });
  const res = await api.post("/api/auth/login", {
    data: { identifier: ADMIN_ID, password: ADMIN_PW },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  adminToken = body.access_token;
});

test.afterAll(async () => {
  // Clean up test project
  if (testProjectId) {
    await api.delete(`/api/projects/${testProjectId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
  await api.dispose();
});

function authHeaders() {
  return { Authorization: `Bearer ${adminToken}` };
}

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

test.describe("Projects CRUD", () => {
  test("POST /api/projects creates a project", async () => {
    const res = await api.post("/api/projects", {
      headers: authHeaders(),
      data: { name: "e2e_test_project", path: "e2e_test_project" },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("e2e_test_project");
    testProjectId = body.id;
  });

  test("GET /api/projects lists projects", async () => {
    const res = await api.get("/api/projects", {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("projects");
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.length).toBeGreaterThan(0);
  });

  test("PUT /api/projects/:id updates a project", async () => {
    const res = await api.put(`/api/projects/${testProjectId}`, {
      headers: authHeaders(),
      data: { name: "e2e_updated_project" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("e2e_updated_project");
  });

  test("returns 401 without auth", async () => {
    const res = await api.get("/api/projects");
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
      headers: authHeaders(),
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
      headers: authHeaders(),
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
    const res = await api.get(`/api/context/project/${testProjectId}/chats`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("chats");
    expect(body.chats.length).toBeGreaterThanOrEqual(2);

    const titles = body.chats.map((c: { title: string }) => c.title);
    expect(titles).toContain("E2E Chat 1");
    expect(titles).toContain("E2E Chat 2");
  });

  test("GET /api/context/conversations/:id returns chat state", async () => {
    const res = await api.get(`/api/context/conversations/${chatId1}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.chat_id).toBe(chatId1);
    expect(body).toHaveProperty("messages");
    expect(body).toHaveProperty("current_token_count");
  });

  test("PUT /api/context/chats/:id updates chat title", async () => {
    const res = await api.put(`/api/context/chats/${chatId1}`, {
      headers: authHeaders(),
      data: { title: "E2E Chat 1 Updated" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.title).toBe("E2E Chat 1 Updated");
  });

  test("DELETE /api/context/chats/:id deletes a chat", async () => {
    const res = await api.delete(`/api/context/chats/${chatId2}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(204);
  });

  test("deleted chat returns 404", async () => {
    const res = await api.get(`/api/context/conversations/${chatId2}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Default chat creation
// ---------------------------------------------------------------------------

test.describe("Default chat", () => {
  test("POST /api/context/project/:id/default-chat creates or returns default", async () => {
    const res = await api.post(
      `/api/context/project/${testProjectId}/default-chat`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("chat_id");
    expect(body).toHaveProperty("conversation");
    expect(body.conversation.project_id).toBe(testProjectId);
  });

  test("calling default-chat twice returns same chat", async () => {
    const res1 = await api.post(
      `/api/context/project/${testProjectId}/default-chat`,
      { headers: authHeaders() }
    );
    const res2 = await api.post(
      `/api/context/project/${testProjectId}/default-chat`,
      { headers: authHeaders() }
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
    const res = await api.get(`/api/kb/sources/${testProjectId}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("sources");
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body).toHaveProperty("count");
    expect(typeof body.count).toBe("number");
  });

  test("POST /api/kb/search returns search results or service unavailable", async () => {
    const res = await api.post("/api/kb/search", {
      headers: authHeaders(),
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
    const res = await api.get(`/api/kb/sources/${testProjectId}`);
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Snapshots API
// ---------------------------------------------------------------------------

test.describe("Snapshots API", () => {
  test("GET /api/projects/:id/snapshots returns snapshot list or service unavailable", async () => {
    const res = await api.get(
      `/api/projects/${testProjectId}/snapshots`,
      { headers: authHeaders() }
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
    const res = await api.get(`/api/projects/${testProjectId}/snapshots`);
    expect(res.status()).toBe(401);
  });
});
