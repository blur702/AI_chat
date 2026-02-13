import { execFileSync } from "child_process";

const SAFE_USERNAME = /^[A-Za-z0-9._@-]+$/;

export function resetLockout(username: string) {
  if (!SAFE_USERNAME.test(username)) {
    throw new Error(`Invalid username for DB operation: "${username}"`);
  }

  try {
    execFileSync("docker", [
      "exec",
      "workstation-postgres",
      "psql",
      "-U",
      "workstation_user",
      "-d",
      "workstation",
      "-c",
      `UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE username='${username}';`,
    ]);
  } catch (err) {
    console.warn(`[db helper] resetLockout failed: ${err instanceof Error ? err.message : err}`);
  }
}

export function deleteTestUsers() {
  try {
    execFileSync("docker", [
      "exec",
      "workstation-postgres",
      "psql",
      "-U",
      "workstation_user",
      "-d",
      "workstation",
      "-c",
      "DELETE FROM users WHERE username LIKE 'e2e_%';",
    ]);
  } catch (err) {
    console.warn(`[db helper] deleteTestUsers failed: ${err instanceof Error ? err.message : err}`);
  }
}

/** Flush all rate-limit keys from Redis so tests aren't throttled. */
export function flushRateLimits() {
  try {
    execFileSync("docker", [
      "exec",
      "workstation-redis",
      "redis-cli",
      "-a",
      process.env.REDIS_PASSWORD ?? "changeme_strong_redis_password",
      "--no-auth-warning",
      "EVAL",
      "local keys = redis.call('KEYS','rate_limit:*') for _,k in ipairs(keys) do redis.call('DEL',k) end return #keys",
      "0",
    ]);
  } catch (err) {
    console.warn(`[db helper] flushRateLimits failed: ${err instanceof Error ? err.message : err}`);
  }
}
