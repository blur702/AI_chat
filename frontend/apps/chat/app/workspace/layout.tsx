"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@workstation/api";
import { ServiceStatusBanner } from "@/components/service-status-banner";
import { WorkspaceStatusBar } from "@/components/workspace/workspace-status-bar";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, router, pathname]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col">
      <ServiceStatusBanner />
      <main className="flex-1 overflow-hidden">{children}</main>
      <WorkspaceStatusBar />
    </div>
  );
}
