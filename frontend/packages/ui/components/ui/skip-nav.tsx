import * as React from "react";
import { cn } from "../../lib/utils";

interface SkipNavProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
}

/**
 * Visually hidden link that appears on keyboard focus, allowing users
 * to skip repetitive navigation and jump directly to main content.
 */
const SkipNav = React.forwardRef<HTMLAnchorElement, SkipNavProps>(
  ({ className, href = "#main-content", children = "Skip to main content", ...props }, ref) => {
    return (
      <a
        ref={ref}
        href={href}
        className={cn(
          "sr-only-focusable fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          className
        )}
        {...props}
      >
        {children}
      </a>
    );
  }
);
SkipNav.displayName = "SkipNav";

export { SkipNav };
