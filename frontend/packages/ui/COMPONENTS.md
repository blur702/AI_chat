# UI Component Catalog

`@workstation/ui` is the shared frontend component package. Components are consumed as source by `@workstation/chat` (no separate package build step).

## Import Convention

Use package imports from `@workstation/ui` or direct component paths under `@workstation/ui/components/ui/*`.

## Component Groups

### Layout

- `ScrollArea`
- `Separator`
- `Skeleton`
- `Sheet`
- `Tabs`

### Form

- `Button`
- `Input`
- `Textarea`
- `Switch`
- `SettingsToggle`
- `LoadingButton`

### Overlay

- `Dialog`
- `DropdownMenu`
- `ContextMenu`
- `Tooltip`

### Data Display

- `Badge`
- `Progress`
- `InlineAlert`
- `StatusMessage`

### Navigation And Theme

- `SkipNav`
- `ThemeProvider`
- `ThemeToggle`

## Key Usage Rules

- Icon-only buttons require `aria-label`.
- Dialogs must include `DialogTitle`.
- Keep touch targets at least `44x44`.
- Use `LoadingButton` for async submit states instead of manual spinners.

## Utility Exports

- `cn`
- `announceToScreenReader`
- `useMediaQuery`
- `useBreakpoint`
- `useSwipe`

## Related Docs

- Accessibility rules: [`frontend/packages/ui/ACCESSIBILITY.md`](./ACCESSIBILITY.md)
- Responsive system: [`frontend/packages/ui/RESPONSIVE.md`](./RESPONSIVE.md)
- Component a11y notes: [`frontend/packages/ui/components/ui/README.md`](./components/ui/README.md)
- Documentation hub: [`docs/README.md`](../../../docs/README.md)
