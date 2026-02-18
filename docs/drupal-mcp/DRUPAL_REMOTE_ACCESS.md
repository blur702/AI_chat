# Remote Drupal Server Access

## Server Details
- **Host**: 65.181.112.77
- **User**: root
- **Domain**: ssdd.kevinalthaus.com

## SSH Access

### Using PuTTY/Plink
```bash
plink -ssh -pw "T917nY9ILYmJGtUq" root@65.181.112.77
```

### Using OpenSSH
```bash
ssh root@65.181.112.77
# Password: T917nY9ILYmJGtUq
```

### Host Key (for verification)
```
ssh-ed25519 255 SHA256:EnWadrWQBKWVjQ8UV9ynQuSJbAjEuaMimajwlXoZecw
```

## MCP Server (if reinstalling)

The remote Drupal MCP server runs at `/opt/mcp-server/run.sh`

Claude Code config (`.mcp.json`):
```json
{
  "drupal-remote": {
    "command": "C:/Program Files/PuTTY/plink.exe",
    "args": [
      "-ssh",
      "-pw", "${DRUPAL_SSH_PASSWORD}",
      "-hostkey", "ssh-ed25519 255 SHA256:EnWadrWQBKWVjQ8UV9ynQuSJbAjEuaMimajwlXoZecw",
      "root@65.181.112.77",
      "/opt/mcp-server/run.sh"
    ],
    "env": {
      "DRUPAL_SSH_PASSWORD": "T917nY9ILYmJGtUq"
    }
  }
}
```

## Test Credentials (Drupal site)
- **Username**: testuser
- **Password**: Test123!
