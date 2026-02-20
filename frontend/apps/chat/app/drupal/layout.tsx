"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function DrupalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout mobileTitle="Drupal Manager">{children}</SidebarLayout>;
}
