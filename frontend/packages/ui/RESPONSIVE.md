# Responsive Design System

## Breakpoints

| Token | Width | Target |
| --- | --- | --- |
| `xs` | 0px | Small phones |
| `sm` | 600px | Large phones |
| `md` | 960px | Tablets |
| `lg` | 1280px | Desktop |
| `xl` | 1920px | Large desktop |

These values override Tailwind defaults.

## Hooks

### `useBreakpoint`

Returns:
- `isMobile`: below `md`
- `isTablet`: `md` only
- `isDesktop`: `lg` and up
- `current`: exact token (`xs`/`sm`/`md`/`lg`/`xl`)

### `useMediaQuery`

`useMediaQuery(query: string): boolean` - Accepts any valid CSS media query string (e.g., `"(orientation: portrait)"`, `"(min-width: 600px)"`) and returns `true` when the query matches. The hook subscribes to `matchMedia` events so the value updates in real time as conditions change.

```tsx
const isLandscape = useMediaQuery("(orientation: landscape)");
const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
```

### `useSwipe`

`useSwipe(ref: RefObject<HTMLElement>, options?: { threshold?: number }): SwipeState` - Attaches touch event listeners to the referenced element and detects horizontal/vertical swipe gestures. Returns `{ direction, deltaX, deltaY, swiping }`. The default distance threshold before a swipe is recognized is 50px; pass `{ threshold: <number> }` to customize.

```tsx
const ref = useRef<HTMLDivElement>(null);
const { direction } = useSwipe(ref, { threshold: 30 });
```

## Touch Target Standard

- Minimum interactive size: `44x44px`
- Minimum spacing between adjacent targets: `8px`

Common defaults in this package:
- Buttons/inputs: `h-11`
- Dropdown/tab items: `min-h-[44px]`
- Dialog close button: `h-11 w-11`

## Utility Classes

| Class | Effect |
| --- | --- |
| `.touch-target` | `min-height: 44px; min-width: 44px` |
| `.touch-spacing` | `margin: 8px` |
| `.mobile-stack` | column layout for mobile |
| `.mobile-hide` | hidden below `md` |
| `.mobile-show` | shown below `md` |