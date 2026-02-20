"use client";

import { Suspense } from "react";
import { SidebarLayout } from "@/components/sidebar-layout";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout mobileTitle="Settings">
      <Suspense fallback={<div className="flex items-center justify-center p-8">Loading...</div>}>
        {children}
      </Suspense>
    </SidebarLayout>
  );
}
