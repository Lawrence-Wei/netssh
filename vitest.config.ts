import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/** Vitest config reuses the Vite React plugin and path aliases. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    /** Use jsdom to simulate browser APIs for DOM queries and events. */
    environment: "jsdom",
    /** Expose describe / it / expect globally. */
    globals: true,
    /** Register global test mocks. */
    setupFiles: ["./src/test/setup.ts"],
    /** Ignore CSS imports during tests. */
    css: false,
  },
});
