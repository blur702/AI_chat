# UI Components — Accessibility Usage

## Button

```tsx
// Text button — label is implicit from content
<Button variant="default">Save changes</Button>

// Icon-only button — aria-label is required
<Button size="icon" aria-label="Close dialog">
  <X className="h-4 w-4" />
</Button>

// Disabled button — aria-disabled is set automatically
<Button disabled>Submit</Button>
```

## Input

```tsx
// Always pair with a label
<label htmlFor="email">Email</label>
<Input id="email" type="email" aria-required="true" />

// Error state
<Input id="name" aria-invalid="true" aria-errormessage="name-error" />
<p id="name-error" role="alert">Name is required</p>
```

## Dialog

```tsx
// Always include DialogTitle for screen readers
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm action</DialogTitle>
      <DialogDescription>This cannot be undone.</DialogDescription>
    </DialogHeader>
    {/* content */}
  </DialogContent>
</Dialog>
```

## Badge

```tsx
// Informational badge (role="status" is default)
<Badge>New</Badge>

// Decorative badge — override role
<Badge role="presentation" variant="outline">v2.1</Badge>
```

## Tooltip

```tsx
// Supplementary info only — never hide critical content in tooltips
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button size="icon" aria-label="Help">
        <HelpCircle className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Keyboard shortcut: Ctrl+H</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## SkipNav

```tsx
// Add as first child in layout body
<SkipNav href="#main-content" />
<main id="main-content" role="main">{children}</main>
```

## Screen Reader Announcements

```tsx
import { announceToScreenReader } from "@workstation/ui";

// After async action
await saveDocument();
announceToScreenReader("Document saved");

// Urgent announcement
announceToScreenReader("Connection lost", "assertive");
```
