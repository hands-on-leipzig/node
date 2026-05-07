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
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'haNds On Technology Dashboard',
        short_name: 'HOT Dashboard',
        description: 'Dashboard and enrollment for haNds On Technology.',
        theme_color: '#ff7a00',
        background_color: '#fafaf9',
        display: 'standalone',
        scope: '/',
        start_url: '/dashboard',
        icons: [
          {
            src: '/favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon',
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
