# Responsive Design System

## Breakpoints

| Token | Width   | Target           |
|-------|---------|------------------|
| `xs`  | 0px     | Small phones     |
| `sm`  | 600px   | Large phones     |
| `md`  | 960px   | Tablets          |
| `lg`  | 1280px  | Desktop          |
| `xl`  | 1920px  | Large desktop    |

These override Tailwind defaults. Use them as prefixes (`md:flex`, `lg:hidden`).

## useBreakpoint Hook

```tsx
import { useBreakpoint } from "@workstation/ui";

function MyComponent() {
  const { isMobile, isTablet, isDesktop, current } = useBreakpoint();

  if (isMobile) return <MobileLayout />;
  return <DesktopLayout />;
}
```

- `isMobile` — below 960px (`xs` + `sm`)
- `isTablet` — 960px to 1279px (`md`)
- `isDesktop` — 1280px and above (`lg` + `xl`)
- `current` — exact breakpoint token

## useMediaQuery Hook

```tsx
import { useMediaQuery } from "@workstation/ui";

const isLandscape = useMediaQuery("(orientation: landscape)");
```

## useSwipe Hook

```tsx
import { useSwipe } from "@workstation/ui";
import { useRef } from "react";

function Drawer() {
  const ref = useRef<HTMLDivElement>(null);
  const swipeHandlers = useSwipe(ref, {
    onSwipeLeft: () => closeDrawer(),
  });

  return <div ref={ref} {...swipeHandlers}>...</div>;
}
```

Threshold: 50px minimum swipe distance.

## Touch Targets

All interactive elements must meet **44x44px minimum** touch area:

- Buttons: `h-11` (44px) by default
- Inputs: `h-11` (44px) by default
- Dropdown items: `min-h-[44px]`
- Tab triggers: `min-h-[44px]`
- File tree items: `min-h-[44px]`
- Dialog close: `h-11 w-11`

Spacing between adjacent touch targets: **8px minimum**.

## Tailwind Utilities

| Class           | Effect                          |
|-----------------|---------------------------------|
| `.touch-target` | `min-height: 44px; min-width: 44px` |
| `.touch-spacing`| `margin: 8px`                   |
| `.mobile-stack` | `flex-direction: column`        |
| `.mobile-hide`  | Hidden below `md`, visible above |
| `.mobile-show`  | Visible below `md`, hidden above |

## Layout Patterns

### Chat App (mobile)
- Sidebar becomes a slide-out drawer with backdrop
- Hamburger button in header opens sidebar
- Swipe-left on sidebar to close
- Bottom nav for quick actions

### Sandbox/IDE (mobile)
- Multi-panel layout replaced with tabbed single-panel view
- Bottom tab bar: Files, Code, Terminal, Preview, Chat
- Toolbar hides text labels, shows icons only
- Full-width panels stacked vertically

### Status Bar (mobile)
- Hides VRAM usage info
- Reduces padding and font size
- Shows only connection status
