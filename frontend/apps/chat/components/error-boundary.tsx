"use client";

import React from "react";
import { Button } from "@workstation/ui";
import { AlertTriangle, RotateCcw, WifiOff, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

type ErrorCategory = "chunk_load" | "network" | "generic";

const MAX_AUTO_RETRIES = 3;

function categorizeError(error: Error): ErrorCategory {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Chunk load errors from code-split lazy imports
  if (
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch dynamically imported module")
  ) {
    return "chunk_load";
  }

  // Network errors
  if (
    name === "typeerror" && msg.includes("failed to fetch") ||
    name === "networkerror" ||
    msg.includes("network error") ||
    msg.includes("net::err_")
  ) {
    return "network";
  }

  return "generic";
}

const ERROR_MESSAGES: Record<ErrorCategory, { title: string; description: string }> = {
  chunk_load: {
    title: "Application update available",
    description:
      "A new version was deployed. The page will reload automatically. If not, click the button below.",
  },
  network: {
    title: "Network error",
    description:
      "Unable to reach the server. Check your connection and try again.",
  },
  generic: {
    title: "Something went wrong",
    description:
      "An unexpected error occurred. You can try again or refresh the page.",
  },
};

const ERROR_ICONS: Record<ErrorCategory, React.ReactNode> = {
  chunk_load: <RefreshCw className="h-12 w-12 text-yellow-500" />,
  network: <WifiOff className="h-12 w-12 text-orange-500" />,
  generic: <AlertTriangle className="h-12 w-12 text-destructive" />,
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.props.onError?.(error, errorInfo);

    const category = categorizeError(error);

    // Auto-retry for chunk load errors (common after deployments).
    // Track retries in sessionStorage so the count survives page reloads.
    if (category === "chunk_load") {
      const key = "error_boundary_chunk_retries";
      const retries = parseInt(sessionStorage.getItem(key) ?? "0", 10);
      if (retries < MAX_AUTO_RETRIES) {
        sessionStorage.setItem(key, String(retries + 1));
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        // Exhausted retries — clear counter and show error UI
        sessionStorage.removeItem(key);
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const category = this.state.error
        ? categorizeError(this.state.error)
        : "generic";
      const { title, description } = ERROR_MESSAGES[category];
      const icon = ERROR_ICONS[category];

      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {description}
          </p>
          {this.state.error && category === "generic" && (
            <pre className="mt-2 max-w-lg overflow-auto rounded-md border bg-muted p-3 text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <Button onClick={this.handleRetry} variant="default">
              <RotateCcw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
            >
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
