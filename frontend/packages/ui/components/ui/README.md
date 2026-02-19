# UI Component Accessibility Notes

This file keeps component-level accessibility reminders only.
For full guidance, use:
- `frontend/packages/ui/ACCESSIBILITY.md`
- `frontend/packages/ui/RESPONSIVE.md`

## Quick Rules

- Icon-only `Button` requires `aria-label`.
- `Input` must have visible label or `aria-label`.
- `DialogContent` must include `DialogTitle`.
- Tooltip content must be supplementary (not critical-only).
- Keep touch targets at least `44x44`.

## Helpers

- `SkipNav`: add near top of layout and point to `#main-content`.
- `announceToScreenReader(message, priority?)`: announce async state changes.

## Related Docs

- Catalog: [`frontend/packages/ui/COMPONENTS.md`](../../COMPONENTS.md)
- Accessibility: [`frontend/packages/ui/ACCESSIBILITY.md`](../../ACCESSIBILITY.md)
- Responsive: [`frontend/packages/ui/RESPONSIVE.md`](../../RESPONSIVE.md)
