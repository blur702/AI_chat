"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout mobileTitle="Notes">{children}</SidebarLayout>;
}
