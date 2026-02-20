"use client";

import { SidebarLayout } from "@/components/sidebar-layout";

export default function PalettesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout mobileTitle="Palettes">{children}</SidebarLayout>;
}
