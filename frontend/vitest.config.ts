/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest-only config, kept separate from vite.config.ts because
// vitest pulls in Vite v5 while the production build runs against
// Vite v6 — sharing a single config produces conflicting plugin
// types. The build/test paths thus stay independent.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
