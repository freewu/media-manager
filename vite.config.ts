import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 会在开发时注入 TAURI_DEV_HOST（移动端调试用），桌面端为空
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],

  // Tauri 自己负责清屏，关掉 Vite 的清屏避免覆盖 Rust 日志
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // src-tauri 由 cargo 监听，避免重复触发前端热更新
      ignored: ["**/src-tauri/**", "**/.data/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_ENV_*"],

  build: {
    // Windows 上使用 WebView2 (Chromium)，其他平台用 Safari 13 作为基线
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
