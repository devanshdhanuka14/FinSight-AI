import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://finsight-ai-production-67b0.up.railway.app',
        changeOrigin: true,
      },
    },
  },
})
