import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const csp = "default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' blob: data: https:; worker-src 'self' blob:; connect-src 'self' https:; frame-src https://accounts.google.com https://www.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"
const headers = {
  'Content-Security-Policy': csp,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { host: '127.0.0.1', strictPort: true, headers, proxy: { '/api': 'http://127.0.0.1:8787' } },
})
