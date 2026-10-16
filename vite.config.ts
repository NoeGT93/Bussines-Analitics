import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' permite publicar en GitHub Pages bajo /Bussines-Analitics/
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1600,
    rollupOptions:
      mode === 'single'
        ? undefined
        : {
            output: {
              manualChunks: {
                react: ['react', 'react-dom', 'zustand'],
                charts: ['recharts'],
                motion: ['framer-motion'],
                xlsx: ['xlsx'],
                pdf: ['jspdf', 'jspdf-autotable', 'html-to-image'],
              },
            },
          },
  },
}));
