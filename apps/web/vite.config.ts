import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.METADRIVE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
// The custom-domain Pages deployment is rooted at /, not /metadrive/.
// Keep the project-path default for repositories without a custom domain.
const pagesBase = process.env.GITHUB_PAGES_BASE_PATH ?? '/metadrive/';
if (pagesBase !== '/' && pagesBase !== '/metadrive/') {
  throw new Error('Unsupported GitHub Pages base path');
}

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? pagesBase : '/',
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiProxyTarget,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest) => proxyRequest.removeHeader('origin'));
        }
      }
    }
  },
  preview: {
    port: 4173,
    host: '0.0.0.0'
  }
});
