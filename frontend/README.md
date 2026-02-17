# Frontend

pnpm monorepo containing 1 app and 2 shared packages for the AI Workstation.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@workstation/chat` | `apps/chat` | Next.js 14 app — chat UI, workspace/IDE, terminal, image gen, admin, settings (port 3001) |
| `@workstation/ui` | `packages/ui` | Shared UI components (shadcn/ui + Radix + Tailwind). Consumed as source via `transpilePackages` |
| `@workstation/api` | `packages/api` | TypeScript API client, types mirroring backend Pydantic schemas, React hooks |

## Requirements

- Node.js >= 20.19
- pnpm >= 9 (`npm install -g pnpm`)

## Development Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start chat app dev server (port 3001)
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm type-check       # TypeScript type check across all packages
pnpm test             # Run all tests (vitest)
pnpm test:watch       # Run tests in watch mode
pnpm format           # Format with Prettier
pnpm format:check     # Check Prettier formatting
```

## Architecture Notes

- `@workstation/ui` and `@workstation/api` have **no build step**. They are transpiled directly by the consuming Next.js app via `transpilePackages` in `next.config.js`.
- Tailwind content paths in consuming apps must be specific (e.g. `components/**/*.tsx`) rather than broad globs to avoid scanning `node_modules`.
- The API client auto-redirects to `/login` on 401 responses (expired or missing token).
- All workspace/IDE functionality is consolidated into the `chat` app at `/workspace/[projectId]` — there is no separate sandbox app.

### `@workstation/ui` exports

Components: `Button`, `Input`, `Textarea`, `Dialog`, `Sheet`, `ScrollArea`, `Tabs`, `Tooltip`, `Separator`, `Skeleton`, `Badge`, `DropdownMenu`, `ContextMenu`, `Progress`, `SkipNav`, `Switch`, `SettingsToggle`, `LoadingButton`, `InlineAlert`, `StatusMessage`

Theme: `ThemeProvider`, `ThemeToggle`

Utils: `cn`, `announceToScreenReader`

Responsive hooks: `useMediaQuery`, `useBreakpoint`, `useSwipe`

## Documentation

- Component catalog: `packages/ui/COMPONENTS.md`
- Accessibility: `packages/ui/ACCESSIBILITY.md`
- Responsive system: `packages/ui/RESPONSIVE.md`
- Architecture overview: `../docs/architecture.md`
- Testing guide: `../docs/testing.md`
