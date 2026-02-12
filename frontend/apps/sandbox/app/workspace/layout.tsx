"use client";

import { ServiceStatusBanner } from "@/components/service-status-banner";
import { SandboxStatusBar } from "@/components/sandbox-status-bar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <ServiceStatusBanner />
      <main className="flex-1 overflow-hidden">{children}</main>
      <SandboxStatusBar />
    </div>
  );
}
