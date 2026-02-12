"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@workstation/api";
import { Button } from "@workstation/ui";
import { MessageSquare, ArrowLeft } from "lucide-react";
import { ServiceStatusBanner } from "@/components/service-status-banner";

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    <div className="flex h-screen flex-col">
      <ServiceStatusBanner />
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <Link href="/chat">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Chat
          </Button>
        </Link>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
