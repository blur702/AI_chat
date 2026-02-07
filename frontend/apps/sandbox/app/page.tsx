"use client";

import { useAuth } from "@workstation/api";
import { Button } from "@workstation/ui";
import { Code2 } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-3">
        <Code2 className="h-10 w-10 text-primary" />
        <h1 className="text-4xl font-bold">AI Dev Sandbox</h1>
      </div>
      <p className="text-muted-foreground">
        Your AI-powered development environment
      </p>
      {isAuthenticated ? (
        <Link href="/projects">
          <Button size="lg">Open Projects</Button>
        </Link>
      ) : (
        <Link href="/login">
          <Button size="lg">Sign In</Button>
        </Link>
      )}
    </div>
  );
}
