import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/** Vitest 配置 — 复用 Vite 的 React 插件和路径别名 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    /** 使用 jsdom 模拟浏览器环境，支持 DOM 查询和事件分发 */
    environment: "jsdom",
    /** 全局可用 describe / it / expect，无需手动 import */
    globals: true,
    /** 测试 setup 文件 — 注册全局 mock */
    setupFiles: ["./src/test/setup.ts"],
    /** CSS 模块导入静默忽略 */
    css: false,
  },
});
