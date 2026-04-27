import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
    // Force Vite to use the 'require' condition (CJS) for Cornerstone
    // packages to avoid their ESM circular dependency issues
    conditions: ['require', 'default'],
  },
  base: './',
  optimizeDeps: {
    exclude: ['sharp'],
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      external: ['sharp', '@icr/polyseg-wasm'],
      onwarn(warning, warn) {
        if (warning.message?.includes('polyseg-wasm')) return
        if (warning.message?.includes('circular dependency')) return
        if (warning.message?.includes('dynamic import will not move')) return
        if (warning.message?.includes('different chunks')) return
        warn(warning)
      },
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
