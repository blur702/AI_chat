"use client";

import { SandboxStatusBar } from "@/components/sandbox-status-bar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-hidden">{children}</main>
      <SandboxStatusBar />
    </div>
  );
}
