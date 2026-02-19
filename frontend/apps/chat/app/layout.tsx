import { Suspense } from "react";
import type { Metadata } from "next";
import { ThemeProvider, TooltipProvider, SkipNav } from "@workstation/ui";
import { Providers } from "./providers";
import { ErrorBoundary } from "../components/error-boundary";
import { OfflineBanner } from "../components/offline-banner";
import { GlobalHeader } from "../components/global-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Workstation - Chat",
  description: "AI Chat Interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SkipNav href="#main-content" />
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <ErrorBoundary>
              <Providers>
                <OfflineBanner />
                <Suspense fallback={<div className="h-14 w-full" />}>
                  <GlobalHeader />
                </Suspense>
                <main id="main-content" role="main">
                  {children}
                </main>
              </Providers>
            </ErrorBoundary>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
