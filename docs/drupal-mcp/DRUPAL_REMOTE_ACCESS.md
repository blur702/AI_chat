# Drupal MCP Remote Access

Operational notes for connecting this project to the remote Drupal MCP host.

## Host Information

- Host: `65.181.112.77`
- User: `root`
- Domain: `ssdd.kevinalthaus.com`
- Remote MCP entrypoint: `/opt/mcp-server/run.sh`

## Credential Policy

- Do not store SSH or Drupal credentials in markdown files.
- Use environment variables and secret storage for runtime access.
- Required secrets should be injected as `DRUPAL_VPS_*` / `VPS_DB_*` values.

## SSH Access

OpenSSH:

```bash
ssh root@65.181.112.77
```

PuTTY/Plink:

```bash
plink -ssh root@65.181.112.77
```

Optional host key pinning:

```text
ssh-ed25519 255 SHA256:EnWadrWQBKWVjQ8UV9ynQuSJbAjEuaMimajwlXoZecw
```

## MCP Client Configuration Example

Use environment variables for secrets:

```json
{
  "drupal-remote": {
    "command": "C:/Program Files/PuTTY/plink.exe",
    "args": [
      "-ssh",
      "-pw",
      "${DRUPAL_SSH_PASSWORD}",
      "-hostkey",
      "ssh-ed25519 255 SHA256:EnWadrWQBKWVjQ8UV9ynQuSJbAjEuaMimajwlXoZecw",
      "root@65.181.112.77",
      "/opt/mcp-server/run.sh"
    ]
  }
}
```

## Verification

After MCP server startup:
1. Confirm MCP connection appears healthy in the app's MCP UI.
2. Run a simple remote read/list action from chat.
3. Confirm preview updates in the Drupal panel.

## Runtime Diagnostics

If chat or preview stops updating in real time:
1. Check gateway + backend health:
   - `curl -k https://ssdd.kevinalthaus.com/health`
   - `curl -k https://ssdd.kevinalthaus.com/api/kernel/status`
   - `curl -k https://ssdd.kevinalthaus.com/api/resources/status`
2. If you see repeated `502` on `kernel/status` or `resources/status`, inspect backend and nginx logs first.
3. If streaming fails with browser `ERR_HTTP2_PROTOCOL_ERROR`, verify SSE proxy settings and test the stream endpoint directly from the host.
4. For `401` on `/api/auth/me`, confirm session validity and re-authenticate.

Detailed runbooks:
- [`docs/troubleshooting.md`](../troubleshooting.md)
- [`backend/docs/websocket_reconnection.md`](../../backend/docs/websocket_reconnection.md)

## Related Docs

- Documentation hub: [`docs/README.md`](../README.md)
- Architecture: [`docs/architecture.md`](../architecture.md)
