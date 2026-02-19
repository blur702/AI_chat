# Frontend

pnpm monorepo for the chat application and shared frontend packages.

## Workspace Packages

| Package | Path | Description |
| --- | --- | --- |
| `@workstation/chat` | `apps/chat` | Next.js 14 app (`3001`) with chat, workspace, MCP/Drupal, studio, admin, and settings |
| `@workstation/ui` | `packages/ui` | Shared UI primitives and accessibility helpers |
| `@workstation/api` | `packages/api` | Typed API client and React hooks for backend routes |

## Requirements

- Node.js `>=20.19`
- pnpm `>=9`

## Development Commands

```bash
cd frontend
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm test:watch
pnpm format
pnpm format:check
```

## Notes

- `@workstation/ui` and `@workstation/api` are consumed as source (`transpilePackages`) and do not require separate build steps.
- The API client redirects to `/login` on most `401` responses, but intentionally skips redirect for `/api/auth/me` and `/api/auth/login`.
- Workspace/IDE functionality lives in `@workstation/chat` under `/workspace/[projectId]`.

## Canonical References

- Docs hub: [`docs/README.md`](../docs/README.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
- Testing: [`docs/testing.md`](../docs/testing.md)
- UI catalog: [`frontend/packages/ui/COMPONENTS.md`](packages/ui/COMPONENTS.md)
- UI accessibility: [`frontend/packages/ui/ACCESSIBILITY.md`](packages/ui/ACCESSIBILITY.md)
- UI responsive system: [`frontend/packages/ui/RESPONSIVE.md`](packages/ui/RESPONSIVE.md)
