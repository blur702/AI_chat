"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout mobileTitle="Projects">{children}</SidebarLayout>;
}
