# Accessibility Guide (WCAG AA)

## Color Contrast

All semantic color pairings target WCAG AA minimum contrast:
- Normal text: 4.5:1+
- Large text: 3:1+

## Focus Indicators

Interactive elements use visible `:focus-visible` styles (2px ring + offset).
Global defaults are in `globals.css`; components use Tailwind focus-ring utilities.

## Reduced Motion

`@media (prefers-reduced-motion: reduce)` in `globals.css` disables animations, transitions, and smooth scrolling.

## Skip Navigation

Use `SkipNav` so keyboard users can jump to `#main-content`.

## Keyboard Behavior

Radix-based components support keyboard navigation by default:
- Dialog: focus trap, Escape close, focus restore
- Menus: arrow navigation, type-ahead, Escape close
- Tabs: arrow navigation across triggers
- Tooltip: visible on keyboard focus

## Live Regions

Use ARIA live regions for dynamic updates:
- Message lists: `aria-live="polite"` and `role="log"`
- Loading areas: `aria-busy="true"`
- Status badges: `role="status"`

## Component Requirements

- Icon-only buttons need `aria-label`.
- Inputs need label association and proper `aria-invalid`/error wiring.
- Dialogs need `DialogTitle` (and usually `DialogDescription`).
- Keyboard shortcut hint text in menus should be `aria-hidden="true"`.

## Utility

Use ARIA live regions (`aria-live="assertive"` or `aria-live="polite"`) to broadcast screen-reader announcements for async actions.

## Manual Checklist

1. Tab through all controls and verify focus visibility.
2. Test the skip link from top-of-page Tab.
3. Test with NVDA or VoiceOver.
4. Enable OS reduced-motion and verify animations are suppressed.
5. Validate labels/alt text and form error announcements.

## Related Docs

- Component catalog: [`frontend/packages/ui/COMPONENTS.md`](./COMPONENTS.md)
- Responsive system: [`frontend/packages/ui/RESPONSIVE.md`](./RESPONSIVE.md)
- Docs hub: [`docs/README.md`](../../../docs/README.md)
