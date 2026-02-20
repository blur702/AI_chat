/**
 * Safely extract an error message from an unknown caught value.
 */
export function extractErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred"
): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (
    err !== null &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}
