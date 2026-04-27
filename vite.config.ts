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
    rollupOptions: {
      external: ['sharp', '@icr/polyseg-wasm'],
      onwarn(warning, warn) {
        // Suppress expected warnings from Cornerstone's circular internals
        if (warning.code === 'CIRCULAR_DEPENDENCY') return
        if (warning.code === 'INVALID_ANNOTATION_TARGET') return
        if (
          warning.message?.includes('polyseg-wasm') ||
          warning.message?.includes('dynamic import will not move') ||
          warning.message?.includes('circular dependency between chunks')
        ) return
        warn(warning)
      },
      output: {
        // Keep all Cornerstone code in one chunk so internal module
        // initialization order is preserved — prevents naA/GIA crashes
        manualChunks(id) {
          if (
            id.includes('node_modules/@cornerstonejs') ||
            id.includes('node_modules/dicom-parser') ||
            id.includes('node_modules/dcmjs')
          ) {
            return 'cornerstone'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react'
          }
        },
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
