import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait()
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },

  base: './',

  // ✅ THIS FIXES YOUR ERROR
  assetsInclude: ['**/*.wasm'],

  optimizeDeps: {
    exclude: [
      'sharp',
      '@icr/polyseg-wasm'
    ],
  },

  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      external: ['sharp'],
    },
  },

  worker: {
    format: 'es',
  },

  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})