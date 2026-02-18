"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout mobileTitle="AI Chat">{children}</SidebarLayout>;
}
