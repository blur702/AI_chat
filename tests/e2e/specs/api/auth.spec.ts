import { test, expect, APIRequestContext } from "@playwright/test";
import { resetLockout, deleteTestUsers, flushRateLimits } from "../../helpers/db";

const BASE = process.env.API_BASE_URL ?? "http://localhost";
const ADMIN_ID = "admin";
const ADMIN_PW = "Admin123!";

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  flushRateLimits();
  resetLockout("admin");
  api = await playwright.request.newContext({ baseURL: BASE });
});

test.afterAll(async () => {
  await api.dispose();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(identifier: string, password: string) {
  return api.post("/api/auth/login", {
    data: { identifier, password },
  });
}

async function getAdminToken(): Promise<string> {
  flushRateLimits();
  const res = await login(ADMIN_ID, ADMIN_PW);
  const body = await res.json();
  return body.access_token;
}

// ---------------------------------------------------------------------------
// Login endpoint
// ---------------------------------------------------------------------------

test.describe("POST /api/auth/login", () => {
  test.beforeAll(async () => {
    flushRateLimits();
    resetLockout("admin");
  });

  test("returns token for valid credentials", async () => {
    const res = await login(ADMIN_ID, ADMIN_PW);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("access_token");
    expect(body.token_type).toBe("bearer");
    expect(body.role).toBe("admin");
    expect(body.username).toBe("admin");
    expect(body.user_id).toBeTruthy();
    expect(body.screen_name).toBeTruthy();
  });

  test("returns 401 for wrong password", async () => {
    const res = await login(ADMIN_ID, "wrong");
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe("Invalid credentials");
  });

  test("returns 401 for non-existent user", async () => {
    const res = await login("nobody_here", "anything");
    expect(res.status()).toBe(401);
  });

  test("accepts email as identifier", async () => {
    flushRateLimits();
    const res = await login("admin@workstation.local", ADMIN_PW);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("admin");
  });

  test("rejects empty identifier", async () => {
    const res = await login("", ADMIN_PW);
    expect(res.status()).toBe(401);
  });

  test("rejects empty password", async () => {
    const res = await api.post("/api/auth/login", {
      data: { identifier: ADMIN_ID, password: "" },
    });
    // pydantic validation, 401, or rate-limited
    expect([401, 422, 429]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Account lockout
// ---------------------------------------------------------------------------

test.describe("Account lockout", () => {
  test.beforeAll(async () => {
    flushRateLimits();
    resetLockout("admin");
  });

  test.beforeEach(() => {
    flushRateLimits();
  });

  test.afterAll(async () => {
    resetLockout("admin");
  });

  test("locks account after 5 failed attempts", async () => {
    flushRateLimits();
    resetLockout("admin");

    // 5 wrong attempts — flush before each to avoid login rate limit (5/900s)
    for (let i = 0; i < 5; i++) {
      flushRateLimits();
      const res = await login(ADMIN_ID, "bad_password");
      expect(res.status()).toBe(401);
    }

    // 6th attempt - still locked
    flushRateLimits();
    const locked = await login(ADMIN_ID, "bad_password");
    expect(locked.status()).toBe(401);

    // Correct password also rejected while locked
    flushRateLimits();
    const correct = await login(ADMIN_ID, ADMIN_PW);
    expect(correct.status()).toBe(401);
  });

  test("login succeeds after lockout is cleared", async () => {
    flushRateLimits();
    resetLockout("admin");
    const res = await login(ADMIN_ID, ADMIN_PW);
    expect(res.status()).toBe(200);
  });

  test("successful login resets failed counter", async () => {
    flushRateLimits();
    resetLockout("admin");

    // Make 3 failed attempts (below threshold)
    for (let i = 0; i < 3; i++) {
      await login(ADMIN_ID, "bad_password");
    }
    // Succeed
    flushRateLimits();
    const res = await login(ADMIN_ID, ADMIN_PW);
    expect(res.status()).toBe(200);

    // 3 more failures should NOT lock (counter was reset)
    for (let i = 0; i < 3; i++) {
      await login(ADMIN_ID, "bad_password");
    }
    flushRateLimits();
    const res2 = await login(ADMIN_ID, ADMIN_PW);
    expect(res2.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

test.describe("GET /api/auth/me", () => {
  test("returns user info with valid token", async () => {
    const token = await getAdminToken();

    const res = await api.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.username).toBe("admin");
    expect(body.role).toBe("admin");
    expect(body.is_active).toBe(true);
    expect(body.email).toBe("admin@workstation.local");
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("first_name");
    expect(body).toHaveProperty("last_name");
    expect(body).toHaveProperty("screen_name");
  });

  test("returns 401 without token", async () => {
    const res = await api.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token", async () => {
    const res = await api.get("/api/auth/me", {
      headers: { Authorization: "Bearer invalidtoken123" },
    });
    expect(res.status()).toBe(401);
  });

  test("returns 401 with malformed Authorization header", async () => {
    const res = await api.get("/api/auth/me", {
      headers: { Authorization: "NotBearer token" },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/users (admin-only user creation)
// ---------------------------------------------------------------------------

test.describe("POST /api/auth/users", () => {
  test.beforeAll(async () => {
    flushRateLimits();
    deleteTestUsers();
  });

  test.beforeEach(() => {
    flushRateLimits();
  });

  test.afterAll(async () => {
    deleteTestUsers();
  });

  test("admin can create a user", async () => {
    deleteTestUsers(); // Ensure clean state even on retry
    const token = await getAdminToken();

    const res = await api.post("/api/auth/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: "e2e_newuser",
        email: "e2e_new@example.com",
        password: "StrongPass1!",
        role: "user",
        first_name: "Test",
        last_name: "User",
        screen_name: "tester",
      },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.username).toBe("e2e_newuser");
    expect(body.email).toBe("e2e_new@example.com");
    expect(body.role).toBe("user");
    expect(body.is_active).toBe(true);
    expect(body.first_name).toBe("Test");
    expect(body.last_name).toBe("User");
    expect(body.screen_name).toBe("tester");
    expect(body).toHaveProperty("id");
  });

  test("newly created user can login", async () => {
    flushRateLimits();
    const res = await login("e2e_newuser", "StrongPass1!");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("user");
  });

  test("rejects duplicate username", async () => {
    const token = await getAdminToken();
    const res = await api.post("/api/auth/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: "e2e_newuser",
        password: "AnotherPass1!",
        role: "user",
      },
    });
    expect(res.status()).toBe(409);
  });

  test("rejects duplicate email", async () => {
    const token = await getAdminToken();
    const res = await api.post("/api/auth/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: "e2e_another",
        email: "e2e_new@example.com",
        password: "AnotherPass1!",
        role: "user",
      },
    });
    expect(res.status()).toBe(409);
  });

  test("non-admin cannot create users", async () => {
    flushRateLimits();
    const loginRes = await login("e2e_newuser", "StrongPass1!");
    const body = await loginRes.json();

    const res = await api.post("/api/auth/users", {
      headers: { Authorization: `Bearer ${body.access_token}` },
      data: {
        username: "e2e_hacker",
        password: "HackerPass1!",
        role: "admin",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects request without auth", async () => {
    const res = await api.post("/api/auth/users", {
      data: {
        username: "e2e_noauth",
        password: "NoAuth1234!",
        role: "user",
      },
    });
    expect(res.status()).toBe(401);
  });
});
