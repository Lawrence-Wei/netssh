import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite runs the React frontend during Tauri development.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (!normalizedId.includes("node_modules")) return undefined;
          if (normalizedId.includes("/react/") || normalizedId.includes("/react-dom/") || normalizedId.includes("/scheduler/")) return "vendor-react";
          if (normalizedId.includes("/@tauri-apps/")) return "vendor-tauri";
          if (normalizedId.includes("/@xterm/")) return "vendor-terminal";
          if (normalizedId.includes("/xlsx/")) return "vendor-xlsx";
          return "vendor";
        },
      },
    },
  },
});
