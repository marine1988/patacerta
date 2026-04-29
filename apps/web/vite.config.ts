import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// ------------------------------------------------------------
// Manual chunks
//
// Split do bundle inicial em fatias por vendor estável: o
// browser pode cachear separadamente cada grupo e uma alteração
// no nosso código não invalida `react-vendor`/`router-vendor`/
// `query-vendor` (que mudam raramente).
//
// Não tocamos no leaflet — o Vite já o coloca em chunk próprio
// via os imports dinâmicos das páginas que o usam.
// ------------------------------------------------------------
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('react-router')) return 'router-vendor'
  if (id.includes('@tanstack/react-query') || id.includes('@tanstack\\react-query')) {
    return 'query-vendor'
  }
  if (id.includes('react-error-boundary')) return 'react-vendor'
  if (id.includes('axios')) return 'http-vendor'
  if (id.includes('zod')) return 'validation-vendor'

  // react/react-dom têm de ficar juntos — separar dá problemas
  // com o singleton do React (hooks só funcionam se for a mesma
  // instância em runtime).
  if (
    id.includes('node_modules/react/') ||
    id.includes('node_modules/react-dom/') ||
    id.includes('node_modules\\react\\') ||
    id.includes('node_modules\\react-dom\\') ||
    id.includes('/scheduler/') ||
    id.includes('\\scheduler\\')
  ) {
    return 'react-vendor'
  }

  return undefined
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
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
