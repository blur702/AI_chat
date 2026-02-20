"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@workstation/api";
import { ServiceStatusBanner } from "@/components/service-status-banner";
import { WorkspaceStatusBar } from "@/components/workspace/workspace-status-bar";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isLoading, router, pathname]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col">
      <ServiceStatusBanner />
      <main className="flex-1 overflow-hidden">{children}</main>
      <WorkspaceStatusBar />
    </div>
  );
}
