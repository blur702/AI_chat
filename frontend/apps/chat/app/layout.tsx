import type { Metadata } from "next";
import { ThemeProvider } from "@workstation/ui";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Workstation - Chat",
  description: "AI Chat Interface",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
