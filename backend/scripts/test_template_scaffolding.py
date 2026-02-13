"""Test that project creation with template_id properly scaffolds files."""
import requests
import time
import subprocess

BASE = "http://localhost:8001"

# Login
r = requests.post(f"{BASE}/api/auth/login", json={"identifier": "admin", "password": "Admin123!"}, timeout=5)
assert r.status_code == 200, f"Login failed: {r.text}"
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Create project with python-blank template
r = requests.post(f"{BASE}/api/projects", json={
    "name": "Full Fix Test",
    "path": "full-fix-test",
    "type": "python",
    "template_id": "python-blank",
}, headers=headers, timeout=30)
print(f"Create project: {r.status_code}")
data = r.json()
print(data)
project_id = data["id"]

# Wait for provisioning to complete
time.sleep(3)

# Check backend logs for this project
print("\n--- Backend logs for this project ---")
result = subprocess.run(
    ["docker", "logs", "workstation-backend", "--tail", "30"],
    capture_output=True, text=True
)
for line in result.stderr.split("\n"):
    if project_id[:8] in line or "template" in line.lower() or "Applied" in line or "Provisioned" in line:
        print(line)

# Fetch files
r = requests.get(f"{BASE}/api/sandbox/{project_id}/files", headers=headers, timeout=10)
print(f"\nFiles endpoint: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    print(f"Total files: {data.get('total', 0)}")
    for f in data.get("files", []):
        print(f"  {f.get('name', '?')} ({f.get('type', '?')})")
else:
    print(f"Error: {r.text[:200]}")

print(f"\nProject ID: {project_id}")
