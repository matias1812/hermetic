import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Redirect / to landing.html in dev
    {
      name: 'landing-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url.split('?')[0];
          if (url === '/') {
            req.url = '/landing.html';
          } else if (url === '/app' || url === '/app/') {
            req.url = '/index.html';
          } else if (!url.startsWith('/api') && !url.startsWith('/ws') && !url.startsWith('/@') && !url.includes('.')) {
            // Si es una ruta sin punto ni slash conocido como /rutainexistente
            if (url !== '/app' && url !== '/') {
              req.url = '/404.html';
            }
          }
          next();
        });
      }
    }
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
        notfound: resolve(__dirname, '404.html'),
      },
    },
  },
  server: {
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
