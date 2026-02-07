"use client";

import { Button, ThemeToggle } from "@workstation/ui";
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
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Appearance</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose how the interface looks, or sync with your system settings.
          </p>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">Select your preferred theme</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </section>

      <p className="text-muted-foreground mt-6">
        More settings coming soon. Configure your AI models, preferences, and more.
      </p>
    </div>
  );
}
