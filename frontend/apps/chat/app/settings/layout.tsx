"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout mobileTitle="Settings">{children}</SidebarLayout>;
}
