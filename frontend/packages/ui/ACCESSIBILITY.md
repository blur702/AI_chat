# Accessibility Guide (WCAG AA)

## Color Contrast

All color pairings meet WCAG AA minimum contrast ratios (4.5:1 for normal text, 3:1 for large text):

| Combination | Ratio | Pass |
|---|---|---|
| Foreground on Background (light) | 8.2:1 | AA |
| Foreground on White | 10.4:1 | AA |
| Primary on Dark Background | 6.9:1 | AA |
| Light text on Dark Background | 13.1:1 | AA |

## Focus Indicators

All interactive elements use a 2px solid primary-color outline with 2px offset on `:focus-visible`. This ensures keyboard users can clearly identify the focused element without affecting mouse users.

Global styles are defined in `globals.css`. Individual components use Tailwind's `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` pattern.

## Reduced Motion

The `@media (prefers-reduced-motion: reduce)` query in `globals.css` disables all animations and transitions for users who prefer reduced motion. This includes:
- CSS animations (`animation-duration: 0.01ms`)
- CSS transitions (`transition-duration: 0.01ms`)
- Smooth scrolling (`scroll-behavior: auto`)

## Skip Navigation

Both app layouts include a `<SkipNav>` component — a visually hidden link that becomes visible on keyboard focus, allowing users to skip directly to `#main-content`.

## Keyboard Navigation

All interactive components are built on Radix UI primitives, which provide:
- **Dialog**: Focus trap, Escape to close, focus restoration on close
- **DropdownMenu / ContextMenu**: Arrow key navigation, type-ahead, Escape to close
- **Tabs**: Arrow key navigation between triggers, Tab to move into content
- **Tooltip**: Appears on keyboard focus, dismissed with Escape

## ARIA Live Regions

Dynamic content areas use ARIA live regions to announce changes to screen readers:
- **Message thread**: `aria-live="polite"` with `role="log"` announces new messages
- **Loading states**: `aria-busy="true"` indicates content is loading
- **Badges**: `role="status"` for informational badges

## Component Guidelines

### Buttons
- Icon-only buttons (size="icon") must have `aria-label`
- Disabled buttons include `aria-disabled="true"`

### Inputs
- Always pair with a visible `<label>` or `aria-label`
- Use `aria-invalid="true"` and `aria-errormessage` for error states
- Use `aria-required="true"` for required fields
- Error state styling activates automatically via `aria-[invalid=true]`

### Dialogs
- Always include `DialogTitle` inside `DialogContent`
- Use `DialogDescription` for additional context

### Menus
- Keyboard shortcut display spans have `aria-hidden="true"` (Radix announces shortcuts separately)

### Badges
- Default to `role="status"` for screen reader announcements

## Utilities

### `announceToScreenReader(message, priority?)`
Programmatically announce a message via ARIA live region. Useful for toast notifications, form submissions, or other dynamic state changes.

```tsx
import { announceToScreenReader } from "@workstation/ui";
announceToScreenReader("Message sent successfully");
announceToScreenReader("Error: connection lost", "assertive");
```

## Testing

### Manual Testing Checklist
1. Tab through all interactive elements — verify visible focus indicator
2. Activate skip link by pressing Tab immediately after page load
3. Use screen reader (NVDA/VoiceOver) to navigate all components
4. Enable "Reduce motion" in OS settings and verify no animations play
5. Verify all images have alt text, all icons have labels or are hidden
6. Verify form error messages are announced to screen readers
