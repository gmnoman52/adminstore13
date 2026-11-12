import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { headersFor } from '../scripts/security-policy.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
  server: { host: '127.0.0.1', cors: false, allowedHosts: ['localhost','127.0.0.1'], fs: { strict: true } },
  preview: { host: '127.0.0.1', cors: false, headers: headersFor('admin') },
})
