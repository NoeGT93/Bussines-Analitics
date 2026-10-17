import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

/**
 * Dos compilaciones:
 * - normal (npm run build): todo empaquetado, para GitHub Pages.
 * - single (npm run build:single): un solo HTML liviano para la vista previa compartible.
 *   Las librerías grandes se cargan desde CDN con versiones fijas, en lugar de ir dentro del archivo.
 */
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/prop-types/15.8.1/prop-types.min.js',
  'https://cdn.jsdelivr.net/npm/recharts@2.12.7/umd/Recharts.js',
  'https://cdn.jsdelivr.net/npm/framer-motion@11.3.24/dist/framer-motion.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
];

const GLOBALS: Record<string, string> = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'ReactDOM',
  recharts: 'Recharts',
  'framer-motion': 'Motion',
  xlsx: 'XLSX',
  jspdf: 'jspdf',
  'html-to-image': 'htmlToImage',
};

function cdnScripts(): Plugin {
  return {
    name: 'cdn-scripts',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('</head>', `${CDN.map((u) => `    <script src="${u}" crossorigin="anonymous"></script>`).join('\n')}\n  </head>`),
    },
  };
}

const shim = (f: string) => fileURLToPath(new URL(`./src/shims/${f}`, import.meta.url));

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), ...(single ? [cdnScripts(), viteSingleFile()] : [])],
    resolve: single
      ? {
          alias: [
            { find: /^react\/jsx-runtime$/, replacement: shim('jsx-runtime.ts') },
            { find: /^react\/jsx-dev-runtime$/, replacement: shim('jsx-runtime.ts') },
            { find: /^jspdf-autotable$/, replacement: shim('autotable.ts') },
          ],
        }
      : undefined,
    build: {
      outDir: single ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 1600,
      rollupOptions: single
        ? { external: Object.keys(GLOBALS), output: { format: 'iife', globals: GLOBALS } }
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
  };
});
