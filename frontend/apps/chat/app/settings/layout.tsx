"use client";

import { Suspense } from "react";
import { SidebarLayout } from "@/components/sidebar-layout";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarLayout mobileTitle="Settings">
      <Suspense>{children}</Suspense>
    </SidebarLayout>
  );
}
