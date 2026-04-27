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
    // Force Cornerstone packages to be pre-bundled together so
    // circular deps are resolved in the correct order
    include: [
      '@cornerstonejs/core',
      '@cornerstonejs/tools',
      '@cornerstonejs/dicom-image-loader',
    ],
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    // Keep Cornerstone in one chunk to avoid GIA-before-init crash
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
