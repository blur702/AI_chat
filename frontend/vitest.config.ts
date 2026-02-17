import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["apps/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/chat"),
      "@workstation/ui": path.resolve(__dirname, "packages/ui"),
      "@workstation/api": path.resolve(__dirname, "packages/api"),
    },
  },
});
