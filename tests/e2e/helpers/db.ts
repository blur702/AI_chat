import { execFileSync } from "child_process";

const SAFE_USERNAME = /^[A-Za-z0-9._@-]+$/;

export function resetLockout(username: string) {
  if (!SAFE_USERNAME.test(username)) {
    throw new Error(`Invalid username for DB operation: "${username}"`);
  }

  execFileSync("docker", [
    "exec",
    "workstation-postgres",
    "psql",
    "-U",
    "workstation_user",
    "-d",
    "workstation",
    "-v",
    `uname=${username}`,
    "-c",
    "UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE username=:'uname';",
  ]);
}

export function deleteTestUsers() {
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
}
