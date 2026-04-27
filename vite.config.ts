import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  base: './',
  optimizeDeps: {
    exclude: ['sharp'],
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    chunkSizeWarningLimit: 50000,
    rollupOptions: {
      external: ['sharp', '@icr/polyseg-wasm'],
      output: {
        // Single output file — no chunking, no circular dep ordering issues
        inlineDynamicImports: true,
      },
      onwarn(warning, warn) {
        if (warning.message?.includes('polyseg-wasm')) return
        if (warning.message?.includes('circular dependency')) return
        if (warning.message?.includes('dynamic import will not move')) return
        if (warning.message?.includes('different chunks')) return
        warn(warning)
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
