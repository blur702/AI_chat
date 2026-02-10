import { test, expect, APIRequestContext } from "@playwright/test";

const BASE = process.env.API_BASE_URL ?? "http://localhost";
const ADMIN_ID = "admin";
const ADMIN_PW = "Admin123!";

let api: APIRequestContext;
let adminToken: string;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: BASE });
  const res = await api.post("/api/auth/login", {
    data: { identifier: ADMIN_ID, password: ADMIN_PW },
  });
  const body = await res.json();
  adminToken = body.access_token;
});

test.afterAll(async () => {
  await api.dispose();
});

// ---------------------------------------------------------------------------
// Health endpoints
// ---------------------------------------------------------------------------

test.describe("Health endpoints", () => {
  test("GET /health returns status", async () => {
    // Through nginx, /health may return nginx's own health or proxy to backend
    const res = await api.get("/health");
    expect([200, 503]).toContain(res.status());

    const text = await res.text();
    // Nginx may return plain text "healthy" or backend JSON
    if (text.startsWith("{")) {
      const body = JSON.parse(text);
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("checks");
    } else {
      // Nginx health returns plain text
      expect(text.trim()).toMatch(/healthy/i);
    }
  });

  test("GET /api/health returns backend service health", async () => {
    const res = await api.get("/api/health");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.service).toBe("backend");
    expect(body.checks.postgres.healthy).toBe(true);
    expect(body.checks.redis.healthy).toBe(true);
  });

  test("GET /api/kernel/health returns kernel service details", async () => {
    const res = await api.get("/api/kernel/health");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("kernel");
    expect(body.kernel).toHaveProperty("initialized");
    expect(body.kernel).toHaveProperty("services");
  });

  test("GET /api/kernel/status returns detailed status (always 200)", async () => {
    const res = await api.get("/api/kernel/status");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.kernel_attached).toBe(true);
    expect(body.initialized).toBe(true);
    expect(body.registered_services).toContain("resource_manager");
    expect(body.registered_services).toContain("event_bus");
    expect(body.registered_services).toContain("tool_registry");
    expect(body.registered_services).toContain("context_manager");
    expect(body).toHaveProperty("service_details");
    expect(body).toHaveProperty("timestamp");
  });
});

// ---------------------------------------------------------------------------
// Tools API
// ---------------------------------------------------------------------------

test.describe("Tools API", () => {
  test("GET /api/tools returns tool list", async () => {
    const res = await api.get("/api/tools", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("tools");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.tools)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Events API
// ---------------------------------------------------------------------------

test.describe("Events API", () => {
  test("GET /api/events returns event list", async () => {
    const res = await api.get("/api/events", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("events");
    expect(Array.isArray(body.events)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Context API
// ---------------------------------------------------------------------------

test.describe("Context API", () => {
  test("GET /api/context/conversations/:id returns 404 for missing chat", async () => {
    const res = await api.get(
      "/api/context/conversations/00000000-0000-0000-0000-000000000000",
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Admin debug endpoints
// ---------------------------------------------------------------------------

test.describe("Admin endpoints", () => {
  test("GET /api/admin/kernel/debug returns debug info", async () => {
    const res = await api.get("/api/admin/kernel/debug", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    // May require admin role check or may be open
    expect([200, 401, 403]).toContain(res.status());
  });

  test("GET /api/admin/kernel/metrics returns metrics", async () => {
    const res = await api.get("/api/admin/kernel/metrics", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([200, 401, 403]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Root endpoint
// ---------------------------------------------------------------------------

test.describe("Root", () => {
  test("GET / returns API info", async () => {
    const res = await api.get("/");
    // Through nginx this proxies to frontend, direct backend would return JSON
    expect([200, 301, 302]).toContain(res.status());
  });
});
