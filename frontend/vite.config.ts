import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execSync } from "node:child_process";

const apiTarget = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8105";

function readGitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function readGitBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const BUILD_TIME = new Date().toISOString();
const COMMIT_SHA = readGitShortSha();
const BRANCH = readGitBranch();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __APP_COMMIT_SHA__: JSON.stringify(COMMIT_SHA),
    __APP_BRANCH__: JSON.stringify(BRANCH),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/generated": { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom"))
            return "react";
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/@tanstack")) return "query";
          if (id.includes("node_modules/i18next") || id.includes("node_modules/react-i18next"))
            return "i18n";
          if (id.includes("node_modules/xstate") || id.includes("node_modules/@xstate"))
            return "xstate";
          if (id.includes("node_modules/zustand")) return "zustand";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/katex")) return "katex";
          if (
            id.includes("node_modules/three") ||
            id.includes("node_modules/@react-three")
          )
            return "three";
          return undefined;
        },
      },
    },
  },
});
