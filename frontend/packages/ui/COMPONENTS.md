# Component Library Catalog

## Overview

This package (`@repo/ui`) is a curated set of UI primitives built on:

- **shadcn/ui** patterns — copy-owned components styled with Tailwind, not a black-box dependency
- **Radix UI** primitives — unstyled, accessible headless components for overlays, menus, and interactive widgets
- **class-variance-authority (cva)** — typed variant system for consistent prop-driven styling
- **Tailwind CSS** — utility-first styling with a custom design token layer (colors, radii, shadows, breakpoints)

All components are transpiled by the consuming Next.js app (no build step in this package). Import paths use the `@repo/ui` alias configured in each app's `tsconfig.json`.

---

## Component Catalog

### Layout

| Component | Description | Import |
|-----------|-------------|--------|
| `ScrollArea` | Overflow container with a styled, cross-browser scrollbar via Radix | `@repo/ui/components/ui/scroll-area` |
| `Separator` | Horizontal or vertical visual divider | `@repo/ui/components/ui/separator` |
| `Skeleton` | Animated placeholder block for loading states | `@repo/ui/components/ui/skeleton` |
| `Sheet` | Off-canvas side panel (drawer) built on Radix Dialog | `@repo/ui/components/ui/sheet` |
| `Tabs` | Accessible tab strip and panel system via Radix | `@repo/ui/components/ui/tabs` |

**ScrollArea** — exports `ScrollArea` and `ScrollBar`. Wrap any scrollable region with `<ScrollArea>` to get consistent scrollbar styling across platforms.

**Sheet** — compound component. Use `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetClose`, `SheetPortal`, and `SheetOverlay` together. `SheetContent` accepts a `side` prop (`"top" | "right" | "bottom" | "left"`).

**Tabs** — use `<Tabs defaultValue>` as the root, `<TabsList>` for the trigger row, `<TabsTrigger value>` for each tab, and `<TabsContent value>` for each panel. Arrow key navigation is handled by Radix.

---

### Form

| Component | Description | Import |
|-----------|-------------|--------|
| `Button` | Primary action element with six variants and four sizes | `@repo/ui/components/ui/button` |
| `Input` | Single-line text field with built-in error styling | `@repo/ui/components/ui/input` |
| `Textarea` | Multi-line text field, same styling baseline as Input | `@repo/ui/components/ui/textarea` |
| `Switch` | Custom toggle control (`role="switch"`) | `@repo/ui/components/ui/switch` |
| `SettingsToggle` | Labeled row with optional description wrapping a Switch | `@repo/ui/components/ui/settings-toggle` |
| `LoadingButton` | Button with a built-in spinner for async actions | `@repo/ui/components/ui/loading-button` |

**Button variants:**

| `variant` | Use case |
|-----------|----------|
| `default` | Primary CTA |
| `destructive` | Irreversible / delete actions |
| `outline` | Secondary action, bordered |
| `secondary` | Lower-emphasis action |
| `ghost` | Minimal, no background |
| `link` | Inline text link style |

**Button sizes:**

| `size` | Height | Notes |
|--------|--------|-------|
| `default` | `h-11` | Standard touch target |
| `sm` | `h-11` | Narrower padding |
| `lg` | `h-11` | Wider padding |
| `icon` | `h-11 w-11` | Square; requires `aria-label` |

All sizes maintain `h-11` (44px) to meet the touch target standard documented in `RESPONSIVE.md`.

**Input / Textarea** — Accepts all native HTML attributes. Set `aria-invalid="true"` to trigger red border/ring error styling. Always pair with a visible `<label>` or `aria-label`.

**Switch** — Controlled component. Required props: `checked: boolean`, `onCheckedChange: (checked: boolean) => void`. Always provide `aria-label` when used outside a `SettingsToggle`.

**SettingsToggle** — Renders a bordered card row. Required props: `label`, `checked`, `onCheckedChange`. Optional: `description` (hint text below label), `disabled`, `children` (inline badge/icon next to label).

**LoadingButton** — Extends all `ButtonProps`. Pass `loading={true}` to disable the button and show a spinning `Loader2` icon. The spinner is presentational and needs no extra ARIA.

---

### Overlay

| Component | Description | Import |
|-----------|-------------|--------|
| `Dialog` | Modal dialog with focus trap and Escape-to-close | `@repo/ui/components/ui/dialog` |
| `DropdownMenu` | Triggered floating menu with keyboard navigation | `@repo/ui/components/ui/dropdown-menu` |
| `ContextMenu` | Right-click contextual menu | `@repo/ui/components/ui/context-menu` |
| `Tooltip` | Hover/focus tooltip via Radix | `@repo/ui/components/ui/tooltip` |

**Dialog** — compound component. Minimum required structure:

```tsx
<Dialog>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    {/* body */}
    <DialogFooter>{/* actions */}</DialogFooter>
  </DialogContent>
</Dialog>
```

`DialogTitle` is required for screen reader announcements. `DialogClose` can be used for custom close buttons inside the content.

**DropdownMenu / ContextMenu** — share the same sub-component shape:
`Trigger`, `Content`, `Item`, `CheckboxItem`, `RadioItem`, `RadioGroup`, `Label`, `Separator`, `Shortcut`, `Group`, `Portal`, `Sub`, `SubTrigger`, `SubContent`.

**Tooltip** — wrap the app (or a subtree) with `<TooltipProvider>`, then:

```tsx
<Tooltip>
  <TooltipTrigger asChild><Button>Hover me</Button></TooltipTrigger>
  <TooltipContent>Tooltip text</TooltipContent>
</Tooltip>
```

---

### Data Display

| Component | Description | Import |
|-----------|-------------|--------|
| `Badge` | Small label chip with semantic color variants | `@repo/ui/components/ui/badge` |
| `Progress` | Radix progress bar with `role="progressbar"` | `@repo/ui/components/ui/progress` |
| `InlineAlert` | Compact status message with icon and `role="alert"` | `@repo/ui/components/ui/inline-alert` |
| `StatusMessage` | Thin wrapper around InlineAlert for success/error feedback | `@repo/ui/components/ui/status-message` |

**Badge variants:** `default` (primary), `secondary`, `destructive`, `outline`. Renders with `role="status"` by default; override with the `role` prop for purely decorative badges.

**Progress** — pass `value` (0–100) to drive the fill width and `aria-valuenow`. Omit `value` for an indeterminate state; add `aria-label` describing the operation.

**InlineAlert** — accepts `message: string` and `variant?: "error" | "success" | "warning" | "info"` (default: `"error"`). Returns `null` when `message` is empty, so it is safe to always mount.

**StatusMessage** — simplified two-state version of InlineAlert. Accepts `message: string` and `type: "success" | "error"`. Maps directly to the corresponding InlineAlert variant. Returns `null` when `message` is empty.

---

### Navigation

| Component | Description | Import |
|-----------|-------------|--------|
| `SkipNav` | Visually hidden skip link that appears on keyboard focus | `@repo/ui/components/ui/skip-nav` |

**SkipNav** — place as the very first element in `<body>`. Defaults to `href="#main-content"` and label "Skip to main content". Add `id="main-content"` to your page's main landmark.

```tsx
// _layout.tsx
<SkipNav />
<main id="main-content">...</main>
```

---

### Theming

| Component | Description | Import |
|-----------|-------------|--------|
| `ThemeToggle` | Ghost icon button that opens a light/dark/system picker | `@repo/ui/components/ui/theme-toggle` |
| `ThemeProvider` | next-themes provider; wrap the app root | `@repo/ui/components/theme-provider` |

**ThemeProvider** — wraps the application to enable `next-themes`. Accepts all `ThemeProviderProps` from next-themes (e.g. `defaultTheme="system"`, `attribute="class"`).

**ThemeToggle** — no props required. Reads and sets theme via `useTheme()`. The trigger button has `aria-label="Toggle theme"`. Three options exposed: Light, Dark, System.

---

## Utility Exports

In addition to components, the package exports several utilities directly from `@repo/ui`:

| Export | Type | Description |
|--------|------|-------------|
| `cn` | function | Merges Tailwind class names using `clsx` + `tailwind-merge` |
| `announceToScreenReader` | function | Injects a temporary ARIA live region for async announcements |
| `useMediaQuery` | hook | Returns `true` when a CSS media query string matches |
| `useBreakpoint` | hook | Returns `{ isMobile, isTablet, isDesktop, current }` |
| `useSwipe` | hook | Detects touch swipe direction on a referenced element |

---

## Variant System

Components with multiple visual states use **class-variance-authority (cva)** to define a typed variant map. This keeps variant logic co-located with the component and surfaces as a clean TypeScript union prop rather than arbitrary `className` strings.

Pattern:

```ts
const componentVariants = cva(
  "base-classes-always-applied",
  {
    variants: {
      variant: { default: "...", destructive: "..." },
      size:    { default: "...", sm: "...", lg: "..." },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

The consuming component spreads `VariantProps<typeof componentVariants>` onto its prop interface, giving callers fully typed autocomplete for `variant` and `size`. Use `buttonVariants` and `badgeVariants` when you need to generate the class string outside of the component itself (e.g. for an `<a>` styled as a button).

---

## Related Documentation

- [ACCESSIBILITY.md](./ACCESSIBILITY.md) — WCAG AA checklist, ARIA patterns, keyboard behavior, focus ring standards, and reduced-motion handling
- [RESPONSIVE.md](./RESPONSIVE.md) — custom breakpoint tokens, responsive hooks (`useBreakpoint`, `useMediaQuery`, `useSwipe`), touch target standards, and utility CSS classes
