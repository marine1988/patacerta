import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Local dev: proxy MinIO public objects directly. In production
      // this is handled by the SPA's nginx (see apps/web/nginx.conf).
      '/patacerta-uploads': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
})
