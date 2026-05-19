import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** When set (e.g. in .env.local), dev server proxies /custom → DDEV so the browser stays same-origin. */
  const ddevProxyTarget = env.VITE_DDEV_PROXY_TARGET?.trim()
  const serverProxy =
    mode === 'development' && ddevProxyTarget
      ? {
          '/custom': {
            target: ddevProxyTarget,
            changeOrigin: true,
            secure: false,
          },
        }
      : undefined

  return {
  appType: 'spa',
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['JOIN_favicon.png', 'pwa-192.png', 'pwa-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'JOIN – Coach Dashboard',
        short_name: 'JOIN',
        description: 'Coach dashboard and enrollment for JOIN.',
        theme_color: '#ff7a00',
        background_color: '#fafaf9',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: serverProxy ? { proxy: serverProxy } : undefined,
  }
})
