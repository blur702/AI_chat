"use client";

import { AuthProvider } from "@workstation/api";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
