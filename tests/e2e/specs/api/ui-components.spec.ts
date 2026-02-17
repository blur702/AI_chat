import { test, expect, APIRequestContext } from "@playwright/test";
import { resetLockout, flushRateLimits } from "../../helpers/db";

const BASE = process.env.API_BASE_URL ?? process.env.BASE_URL ?? "http://localhost";
import { ADMIN_ID, ADMIN_PW } from "../../helpers/credentials";

let api: APIRequestContext;
let anonApi: APIRequestContext;
let adminToken: string;
let createdComponentId: string;

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
  // Clean up created test component
  if (createdComponentId) {
    await api.delete(`/api/ui-components/${createdComponentId}`);
  }
  await api.dispose();
  await anonApi.dispose();
});

// ---------------------------------------------------------------------------
// UI Components CRUD
// ---------------------------------------------------------------------------

test.describe("UI Components CRUD", () => {
  test("POST /api/ui-components creates a component", async () => {
    const res = await api.post("/api/ui-components", {
      data: {
        name: "E2E Test Button",
        category: "basic",
        description: "A test button component",
        html_template: '<button class="btn">{{label}}</button>',
        props_schema: {
          type: "object",
          properties: {
            label: { type: "string", default: "Click me" },
          },
        },
        tags: ["e2e", "test"],
        is_mobile_responsive: true,
      },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("E2E Test Button");
    expect(body.category).toBe("basic");
    expect(body.tags).toContain("e2e");
    expect(body.is_mobile_responsive).toBe(true);
    createdComponentId = body.id;
  });

  test("GET /api/ui-components lists components", async () => {
    const res = await api.get("/api/ui-components");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("components");
    expect(body).toHaveProperty("categories");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.components)).toBe(true);
    expect(body.count).toBeGreaterThan(0);
  });

  test("GET /api/ui-components?category=basic filters by category", async () => {
    const res = await api.get("/api/ui-components?category=basic");
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const comp of body.components) {
      expect(comp.category).toBe("basic");
    }
  });

  test("GET /api/ui-components?tags=e2e filters by tags", async () => {
    const res = await api.get("/api/ui-components?tags=e2e");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.count).toBeGreaterThan(0);
    for (const comp of body.components) {
      expect(comp.tags).toContain("e2e");
    }
  });

  test("GET /api/ui-components/:id returns a specific component", async () => {
    const res = await api.get(`/api/ui-components/${createdComponentId}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(createdComponentId);
    expect(body.name).toBe("E2E Test Button");
    expect(body).toHaveProperty("html_template");
    expect(body).toHaveProperty("props_schema");
  });

  test("PUT /api/ui-components/:id updates a component", async () => {
    const res = await api.put(`/api/ui-components/${createdComponentId}`, {
      data: {
        name: "E2E Test Button Updated",
        description: "Updated description",
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("E2E Test Button Updated");
    expect(body.description).toBe("Updated description");
    // Unchanged fields should persist
    expect(body.category).toBe("basic");
    expect(body.tags).toContain("e2e");
  });

  test("GET /api/ui-components/:id with invalid ID returns 400", async () => {
    const res = await api.get("/api/ui-components/not-a-uuid");
    expect(res.status()).toBe(400);
  });

  test("GET /api/ui-components/:id with nonexistent ID returns 404", async () => {
    const res = await api.get(
      "/api/ui-components/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status()).toBe(404);
  });

  test("returns 401 without auth", async () => {
    const res = await anonApi.get("/api/ui-components");
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

test.describe("UI Component validation", () => {
  test("POST rejects empty name", async () => {
    const res = await api.post("/api/ui-components", {
      data: {
        name: "",
        category: "basic",
        html_template: "<div></div>",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("POST rejects empty html_template", async () => {
    const res = await api.post("/api/ui-components", {
      data: {
        name: "Test",
        category: "basic",
        html_template: "",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("POST rejects missing required fields", async () => {
    const res = await api.post("/api/ui-components", {
      data: { name: "Test" },
    });
    expect(res.status()).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test.describe("UI Component deletion", () => {
  let deleteTargetId: string;

  test("create a component for deletion", async () => {
    const res = await api.post("/api/ui-components", {
      data: {
        name: "E2E Delete Target",
        category: "basic",
        html_template: "<div>delete me</div>",
      },
    });
    expect(res.status()).toBe(201);
    deleteTargetId = (await res.json()).id;
  });

  test("DELETE /api/ui-components/:id removes component", async () => {
    const res = await api.delete(`/api/ui-components/${deleteTargetId}`);
    expect(res.status()).toBe(204);
  });

  test("deleted component returns 404", async () => {
    const res = await api.get(`/api/ui-components/${deleteTargetId}`);
    expect(res.status()).toBe(404);
  });

  test("DELETE nonexistent returns 404", async () => {
    const res = await api.delete(
      "/api/ui-components/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status()).toBe(404);
  });
});
