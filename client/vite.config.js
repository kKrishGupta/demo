import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    // Proxy API calls and WebSockets to the backend server during development
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            // Silently handle proxy errors when backend is starting or offline
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'BACKEND_OFFLINE', message: 'Backend server is not running on port 3001.' }));
            }
          });
        }
      },
      '/ws': {
        target: process.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, socket) => {
            // Gracefully destroy dead proxy socket without throwing unhandled ECONNABORTED/ECONNREFUSED to terminal
            if (socket && !socket.destroyed) {
              socket.destroy();
            }
          });
        }
      },
    },
  },
})
