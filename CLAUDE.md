# CLAUDE.md

Agent-facing notes for Claude Code.

## Source of Truth

Use these docs first:
- `README.md` (system setup and run commands)
- `backend/README.md` (backend dev/test commands)
- `nginx/README.md` (proxy and TLS)

Avoid duplicating architecture and endpoint tables here.

## Minimal Working Commands

```bash
# Start stack
python scripts/startup.py
# or
docker compose up -d

# Backend tests
cd backend
./scripts/run_tests.sh

# Frontend dev
cd frontend
pnpm install
pnpm dev
```

## Notes

- Primary app endpoint is through Nginx (`http://localhost` / `https://localhost`).
- Backend direct endpoint is `http://localhost:8001` by default.
- Keep this file concise and non-duplicative; update core docs instead.

## Drupal (kevinalthaus.com)

- **URL**: `https://kevinalthaus.com` — production Drupal 11.3.3 site
- **VPS**: Ubuntu 24.04 LTS at `65.181.112.77`, nginx + PHP 8.3-FPM + MariaDB 10.11
- **SSH**: `root@$DRUPAL_VPS_HOST` via PuTTY plink (password in `DRUPAL_VPS_PASSWORD` env var), also `kevin@` with key-based auth
- **DB**: MariaDB — database `drupal`, user `drupal`, password in `VPS_DB_PASS` env var, localhost:3306
- **SSL**: Let's Encrypt via certbot
- **Drupal root**: `/var/www/drupal/`, web root `/var/www/drupal/web/`
- **Drush**: `/var/www/drupal/vendor/bin/drush` (enable modules, clear cache, etc.)
- **Connected** to workstation project "Drupal API Documentation" (`155fbe0c-...`) via JSON:API
- **Credentials**: Drupal user `kevin`, password in env vars
- **Content types**: article, event, page, project
- **Custom modules**: `/var/www/drupal/web/modules/custom/` — existing: `congressional_query`, `page_password_protect`
- **Custom themes**: `atomic_react`, `kevin_theme`, `liberty`
- **Contrib modules**: ctools, honeypot, pathauto, redirect, symfony_mailer, token, webform
- **Decoupled frontend**: React SPA at `/var/www/drupal-theme/` served at `/drupal-theme/`
- **DNS**: `kevinalthaus.com` → VPS, `ssdd.kevinalthaus.com` → local dev machine

## Brevo (Email/SMS)

- Backend service `brevo_client` — reads `BREVO_API_KEY` or decodes from `BREVO_MCP_TOKEN`
- API routes at `/api/brevo/*` (account, contacts, email/send, sms/send, templates, campaigns)
- SMS default recipient configured via `SMS_DEFAULT_RECIPIENT` env var