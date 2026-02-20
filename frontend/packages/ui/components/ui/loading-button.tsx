"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
}

/**
 * LoadingButton extends Button with a loading state that disables interaction and shows a spinner.
 * When loading={true}, the button is automatically disabled and aria-disabled is set by the base Button.
 * The Loader2 spinner icon is rendered with animate-spin and is purely visual (no ARIA label needed).
 * All ButtonProps variants and sizes are supported; pair with an aria-label when using size="icon".
 */
const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, disabled, children, ...props }, ref) => (
    <Button ref={ref} disabled={loading || disabled} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
);
LoadingButton.displayName = "LoadingButton";

export { LoadingButton };
