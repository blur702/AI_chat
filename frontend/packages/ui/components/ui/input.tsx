import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Always pair with a visible <label> or provide aria-label for accessibility.
 * Use aria-invalid and aria-errormessage for error states.
 * Use aria-required for required fields.
 * Placeholder text is not a substitute for a proper label.
 */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background transition-all duration-short ease-in-out file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
