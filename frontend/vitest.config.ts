import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  server: {
    fs: {
      allow: [__dirname, path.resolve(__dirname, "../tests/frontend")],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "apps/**/__tests__/**/*.{test,spec}.{ts,tsx}",
      "../tests/frontend/unit/**/*.{test,spec}.{ts,tsx}",
      "../tests/frontend/integration/**/*.{test,spec}.{ts,tsx}",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/chat"),
      "@workstation/ui": path.resolve(__dirname, "packages/ui"),
      "@workstation/api": path.resolve(__dirname, "packages/api"),
      "@testing-library/react": path.resolve(__dirname, "node_modules/@testing-library/react"),
      "@testing-library/jest-dom": path.resolve(
        __dirname,
        "node_modules/@testing-library/jest-dom",
      ),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "next/navigation": path.resolve(__dirname, "node_modules/next/navigation"),
      "next/image": path.resolve(__dirname, "node_modules/next/image"),
      "next/link": path.resolve(__dirname, "node_modules/next/link"),
      "@dnd-kit/core": path.resolve(__dirname, "../tests/frontend/unit/mocks/dnd-kit-core.tsx"),
    },
  },
});
