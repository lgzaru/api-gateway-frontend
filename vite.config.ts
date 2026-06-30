import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/ui/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/sms-proxy': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sms-proxy/, ''),
      },
    },
  },
})
