"use client";

import { useAuth } from "@workstation/api";
import { DrupalDevLayout } from "@/components/drupal/drupal-dev-layout";
import Link from "next/link";

export default function DrupalPage() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 h-screen">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Login Required</h2>
          <p className="text-sm text-muted-foreground">
            Please log in to access the Drupal development environment.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <DrupalDevLayout />
    </div>
  );
}
