import React from "react";
import { cn } from "../../lib/utils";

/**
 * Skeleton renders an animated placeholder used to indicate content that is loading.
 * It is a presentational div with a pulsing animation and should be used in place of
 * real content during async fetches. Pair with aria-busy="true" on the parent container
 * and replace Skeleton nodes with actual content once loading completes.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
