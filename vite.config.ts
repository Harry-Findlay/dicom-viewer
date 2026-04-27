import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    // Stub out WASM imports that Rollup can't handle natively.
    // @icr/polyseg-wasm is only needed for segmentation (not used here).
    {
      name: 'stub-wasm',
      resolveId(id) {
        if (id.endsWith('.wasm') || id.includes('@icr/polyseg-wasm')) {
          return id
        }
      },
      load(id) {
        if (id.endsWith('.wasm') || id.includes('@icr/polyseg-wasm')) {
          return 'export default null; export const ICRPolySeg = null;'
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  base: './',
  optimizeDeps: {
    exclude: ['sharp', '@icr/polyseg-wasm'],
    include: [
      '@cornerstonejs/core',
      '@cornerstonejs/tools',
      '@cornerstonejs/dicom-image-loader',
    ],
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      external: ['sharp'],
      output: {
        manualChunks: {
          cornerstone: [
            '@cornerstonejs/core',
            '@cornerstonejs/tools',
            '@cornerstonejs/dicom-image-loader',
          ],
          react: ['react', 'react-dom'],
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
