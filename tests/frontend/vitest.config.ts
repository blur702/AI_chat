import { defineConfig } from "vitest/config";
import path from "path";

const frontendRoot = path.resolve(__dirname, "../../frontend");

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./setup.ts"],
    include: ["unit/**/*.{test,spec}.{ts,tsx}", "integration/**/*.{test,spec}.{ts,tsx}"],
    root: __dirname,
  },
  resolve: {
    alias: {
      "@": path.resolve(frontendRoot, "apps/chat"),
      "@workstation/ui": path.resolve(frontendRoot, "packages/ui"),
      "@workstation/api": path.resolve(frontendRoot, "packages/api"),
    },
  },
});
