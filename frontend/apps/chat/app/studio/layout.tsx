"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout mobileTitle="Video Studio">{children}</SidebarLayout>;
}
