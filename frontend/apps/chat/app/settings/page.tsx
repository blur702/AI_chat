"use client";

import { Button } from "@workstation/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen flex-col p-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/chat">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>
      <p className="text-muted-foreground">
        Settings page coming soon. Configure your AI models, preferences, and more.
      </p>
    </div>
  );
}
