"use client";

import { useAuth } from "@workstation/api";
import { Button } from "@workstation/ui";
import { MessageSquare, FolderOpen } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-10 w-10 text-primary" />
        <h1 className="text-4xl font-bold">AI Workstation Chat</h1>
      </div>
      <p className="text-muted-foreground">
        Your AI-powered development assistant
      </p>
      {isAuthenticated ? (
        <div className="flex items-center gap-3">
          <Link href="/chat">
            <Button size="lg">
              <MessageSquare className="mr-2 h-5 w-5" />
              Open Chat
            </Button>
          </Link>
          <Link href="/projects">
            <Button size="lg" variant="outline">
              <FolderOpen className="mr-2 h-5 w-5" />
              Projects
            </Button>
          </Link>
        </div>
      ) : (
        <Link href="/login">
          <Button size="lg">Sign In</Button>
        </Link>
      )}
    </div>
  );
}
