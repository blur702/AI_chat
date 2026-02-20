"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function McpLayout({ children }: { children: React.ReactNode }) {
  return <SidebarLayout mobileTitle="MCP Workspace">{children}</SidebarLayout>;
}
