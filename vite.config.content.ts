import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ["revornix"], // 不要预打包 revornix
  },
  build: {
    outDir: 'dist-content',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
        /**
         * 🔹 关键：禁止 revornix 被抽成单独 chunk
         * 返回 undefined 表示按 Rollup 默认逻辑（允许拆包）
         * 返回 null 表示把它内联到入口文件
         */
        manualChunks(id) {
          if (id.includes("node_modules/revornix")) {
            return null; // 把 revornix 直接放进 content.js
          }
        },
      }
    }
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})