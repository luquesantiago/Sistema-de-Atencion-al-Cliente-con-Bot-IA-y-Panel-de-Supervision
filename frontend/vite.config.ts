import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // En Docker el backend es el servicio `backend` (skill backend-datos).
    proxy: {
      '/api': 'http://backend:3000',
    },
  },
})
