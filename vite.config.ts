import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'src/pages/popup/index.html'),
        options: resolve(__dirname, 'src/pages/options/index.html'),
      },
      output: {
        entryFileNames: '[name].js',          // 没有 hash
        chunkFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',    // 静态资源不进 assets/
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